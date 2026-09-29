// junior 手順 5: 図を「.sb 保存」する(書き出しも同じ名前で出る)。先輩の図を読み込んで白紙化し、別の図を起こしたときは、
// 保存・書き出しの前にステータスバーの図名の欄が開いて名前を聞く(元の図の名前のまま黙って出して、元のファイルを上書きしない)。
// 出した名前は図名の横に出て、図名のダブルクリック・F2 で変えられる(BLK-junior-20260929-1908-wish)
const path = require('node:path');
const { test, expect, bootPlain, importSb, getEditorText, saveDir, FIXTURES } = require('./_scenario');

const SRC = path.join(FIXTURES, 'junior-8blocks.sb');

// 白紙化(全選択 → Delete)して、作図 UI で block を 1 つ起こす
async function blankAndDraw(page, name) {
  await page.locator('#svg-wrap svg').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await expect(page.locator('#svg-wrap svg g[data-type="block"]')).toHaveCount(0);
  await page.locator('#prop-content').getByRole('button', { name: '+ ブロック追加' }).click();
  await page.keyboard.type(name);
  await page.keyboard.press('Enter');
  await expect.poll(() => getEditorText(page)).toMatch(new RegExp(`^block ${name} `, 'm'));
  await page.keyboard.press('Escape');
}

test('junior-05: 読み込んだ図を白紙化して起こした図は、保存の前に図名の欄が開き、打った名前で保存・書き出しされる', async ({ page }, testInfo) => {
  await bootPlain(page);
  await importSb(page, SRC);
  await blankAndDraw(page, 'I2cDrv');
  const dir = saveDir(testInfo);
  let downloads = 0;
  page.on('download', () => { downloads++; });

  // 「.sb 保存」: すぐには出さず、図名の欄が開いて元の名前の本体部分が選ばれている
  await page.getByRole('button', { name: '.sb 保存' }).click();
  const inp = page.locator('#status-file-name');
  await expect(inp).toBeFocused();
  await expect(inp).toHaveValue('junior-8blocks.sb');
  await expect(page.locator('#status-file-note')).toContainText('中身を全部入れ替えた');
  expect(await inp.evaluate(el => el.value.slice(el.selectionStart, el.selectionEnd))).toBe('junior-8blocks');
  expect(downloads).toBe(0);

  // そのまま名前を打って Enter: 改名してその名前で保存する
  const [dl] = await Promise.all([page.waitForEvent('download'), (async () => { await page.keyboard.type('i2c_dataflow'); await page.keyboard.press('Enter'); })()]);
  expect(dl.suggestedFilename()).toBe('i2c_dataflow.sb');
  await dl.saveAs(path.join(dir, dl.suggestedFilename()));
  await expect(page.locator('#status-file')).toContainText('i2c_dataflow.sb');
  await expect(page.locator('#status-file-note')).toContainText('i2c_dataflow.sb で保存した');

  // 名前を確かめた後の書き出しは聞き直さず、同じ名前で出る
  const [mmd] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Mermaid', exact: true }).click()]);
  expect(mmd.suggestedFilename()).toBe('i2c_dataflow.mmd');
  await expect(page.locator('#status-file-note')).toContainText('i2c_dataflow.mmd で書き出した');
});

test('junior-05: 白紙化した図の書き出しも先に名前を聞き、Esc でやめると何も出ず、Enter だけなら元の名前のまま出る', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, SRC);
  await blankAndDraw(page, 'CanIf');
  let downloads = 0;
  page.on('download', () => { downloads++; });

  await page.getByRole('button', { name: 'Mermaid', exact: true }).click();
  await expect(page.locator('#status-file-name')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#status-file')).toContainText('junior-8blocks.sb');
  await page.waitForTimeout(300);
  expect(downloads).toBe(0);

  await page.getByRole('button', { name: 'Mermaid', exact: true }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#status-file-name').press('Enter')]);
  expect(dl.suggestedFilename()).toBe('junior-8blocks.mmd');                 // 元の名前で出すと決めたらそのまま
});

test('junior-05: 読み込んだ図を直しただけ(元の要素が残る)なら聞かずにその名前で保存し、出した名前が図名の横に出る', async ({ page }, testInfo) => {
  await bootPlain(page);
  await importSb(page, SRC);
  await page.locator('#svg-wrap svg g[data-type="block"][data-id="b1"]').click();
  await page.keyboard.press('ArrowRight');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '.sb 保存' }).click()]);
  expect(dl.suggestedFilename()).toBe('junior-8blocks.sb');
  await dl.saveAs(path.join(saveDir(testInfo), dl.suggestedFilename()));
  await expect(page.locator('#status-file-note')).toContainText('junior-8blocks.sb で保存した');
  await expect(page.locator('#status-file-note')).toContainText('ダブルクリック');
});
