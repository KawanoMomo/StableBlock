// junior 手順 3〜4(場面3): 先輩の共有部を @include した自分の図を、画布を広げて重なりを避けてから「透過PNG」で再書き出しする。
// 画布は本文の @canvas が正で、共有部の @canvas に戻されない(書き出しが広げる前の高さで切れない)。共有部の block は
// この図からは動かせないので、選ぶと定義の場所と直す先が出て、そのファイルを開ける(BLK-junior-20260926-1105)
const path = require('node:path');
const fs = require('node:fs');
const { test, expect, bootPlain, importSb, getEditorText, saveDir, FIXTURES } = require('./_scenario');

const SET = path.join(FIXTURES, 'primary-set');
const MAIN = path.join(SET, 'spi_swc.sb');
const COMMON = path.join(SET, 'shared', 'common.sb');

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

test('junior-04: 共有部を include した図の画布を広げると、透過PNG も広げた高さで書き出される', async ({ page }, testInfo) => {
  await bootPlain(page);
  await importSb(page, [MAIN, COMMON]);
  const svg = page.locator('#svg-wrap svg');
  await expect(svg.locator('g[data-type="block"][data-id="rte"]')).toHaveCount(1);   // 共有部の block も描かれる
  await expect(page.locator('#status')).toContainText('960×520');

  // ツール欄の画布の高さを 780 にする(共有部の @canvas は 520 のまま)
  await svg.click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Escape');
  const h = page.locator('#canvas-h');
  await h.fill('780');
  await h.press('Enter');
  await expect(page.locator('#status')).toContainText('960×780');
  expect(await getEditorText(page)).toContain('@canvas width=960 height=780 grid=20');
  await expect(svg).toHaveAttribute('viewBox', /^0 0 960 780$/);

  await page.locator('#png-more').click();   // 透過は PNG の ▾ から
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: '背景を透過して保存' }).click()]);
  const file = path.join(saveDir(testInfo), dl.suggestedFilename());
  await dl.saveAs(file);
  expect(pngSize(file)).toEqual({ w: 1920, h: 1560 });   // @canvas × 2。下半分が切れない
});

test('junior-04: 共有部の block を選ぶと、この図から動かせない理由と定義の場所が出て、そのファイルを開いて直せる', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, [MAIN, COMMON]);
  const svg = page.locator('#svg-wrap svg');
  await svg.locator('g[data-type="block"][data-id="rte"]').click();
  const note = page.locator('#prop-included');
  await expect(note).toBeVisible();
  await expect(note).toContainText('include 先 common.sb の L3 で定義(本文 L3 の @include)。この図からは動かせない・変えられないので common.sb で直す');

  // 本文で定義した block には出ない
  const ownId = await svg.locator('g[data-type="block"]:not([data-id="rte"]):not([data-id="os"]):not([data-id="hal"])').first().getAttribute('data-id');
  await svg.locator(`g[data-type="block"][data-id="${ownId}"]`).click();
  await expect(page.locator('#prop-included')).toHaveCount(0);

  // 共有部の block から「common.sb を開く」でそのファイルを開き、同じ block が選ばれて動かせる
  await svg.locator('g[data-type="block"][data-id="rte"]').click();
  await page.getByRole('button', { name: 'common.sb を開く' }).click();
  expect(await getEditorText(page)).toBe(fs.readFileSync(COMMON, 'utf8').replace(/\r\n/g, '\n'));
  await expect(page.locator('#prop-id-now')).toHaveText('rte');
  await expect(page.locator('#prop-included')).toHaveCount(0);
  const box = await svg.locator('g[data-type="block"][data-id="rte"] rect').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  expect(await getEditorText(page)).not.toContain('block rte "RTE" at 20,2 ');
});
