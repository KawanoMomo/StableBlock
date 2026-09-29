// primary 手順 1: 12 枚は RTE・OS・HAL を手書きで複製せず `@include shared/common.sb` で参照する。
// 本文欄に触らずに、何も選んでいないときのツール欄「共通部(@include)」から取り込める。一緒に読み込んだ図すべてに 1 回で足せ、
// 各図の差分は @include の 1 行だけ。外すのも同じ欄から(BLK-primary-20260926-1205-friction)
const fs = require('node:fs');
const path = require('node:path');
const { test, expect, bootPlain, importSb, importFolder, getEditorText, saveDir, FIXTURES } = require('./_scenario');

const SET = path.join(FIXTURES, 'primary-noinc');
const SWC = ['spi', 'can', 'uart', 'adc', 'timer', 'gpio'].map(p => `${p}_swc.sb`);
const COMMON = path.join(SET, 'shared', 'common.sb');
const read = f => fs.readFileSync(f, 'utf8');
// 本文 text の @canvas 行の後に @include の 1 行が入ったもの
const withInclude = (text, p) => text.replace(/(@canvas[^\n]*\n)/, `$1@include "${p}"\n`);

async function saveAll(page, dir, count) {
  const got = [];
  const done = new Promise(resolve => {
    page.on('download', async d => {
      const file = path.join(dir, d.suggestedFilename());
      await d.saveAs(file);
      got.push(file);
      if (got.length === count) resolve();
    });
  });
  await page.getByRole('button', { name: '.sb 保存' }).click();
  await done;
  return got;
}

test('primary-01: ツール欄から共通部を読み込んだ図すべてに取り込み、差分は各図 @include の 1 行だけ', async ({ page }, testInfo) => {
  await bootPlain(page);
  // 6 枚の構成図 + 既に共通部を取り込んでいるデータフロー図 + 共通部
  await importSb(page, [...SWC.map(f => path.join(SET, f)), path.join(SET, 'spi_dataflow.sb'), COMMON]);
  await expect(page).toHaveTitle(/spi_swc\.sb/);
  await expect(page.locator('#error-bar')).toContainText('rte');                // 共通部の rte が無い

  const sec = page.locator('#include-section');
  await expect(sec).toContainText('取り込んでいる図は無い');
  await expect(page.locator('#include-pick option:checked')).toHaveText('common.sb');   // ほかの図が取り込んでいる共通部が先
  await expect(page.locator('#include-path')).toHaveValue('shared/common.sb');           // 同じフォルダの図の書き方

  await page.getByRole('button', { name: 'すべてに取り込む', exact: true }).click();   // 1 クリック
  await expect(page.locator('#include-note')).toContainText('shared/common.sb を 6 枚に取り込んだ');
  expect(await getEditorText(page)).toBe(withInclude(read(path.join(SET, 'spi_swc.sb')), 'shared/common.sb'));
  await expect(page.locator('#svg-wrap svg g[data-type="block"][data-id="rte"]')).toHaveCount(1);
  await expect(page.locator('#error-bar .diag:visible', { hasText: 'rte' })).toHaveCount(0);   // 共通部の rte で解決した
  await expect(sec.locator('.inc-row')).toHaveCount(1);
  await expect(sec.locator('.inc-path')).toHaveText('shared/common.sb');

  // 「.sb 保存」で変わった 6 枚が書き出され、どれも @include の 1 行だけが増えている(データフロー図と共通部は変わらない)
  const files = await saveAll(page, saveDir(testInfo), 6);
  expect(files.map(f => path.basename(f)).sort()).toEqual([...SWC].sort());
  for (const f of files) expect(read(f)).toBe(withInclude(read(path.join(SET, path.basename(f))), 'shared/common.sb'));

  // 外す: 同じ欄の「外す」で本文から消え、元の本文に戻る
  await sec.getByRole('button', { name: '外す' }).click();
  expect(await getEditorText(page)).toBe(read(path.join(SET, 'spi_swc.sb')));
  await expect(sec).toContainText('取り込んでいる図は無い');
});

test('primary-01: 書き方の手本が無いときは本文に書くパスを欄で直してから、この図だけに取り込める', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, [path.join(SET, 'spi_swc.sb'), COMMON]);
  await expect(page.locator('#include-pick option:checked')).toHaveText('common.sb');   // 本文の接続が指す rte を定義している図が先
  await expect(page.locator('#include-path')).toHaveValue('common.sb');        // 「.sb 読込」で選んだ図はフォルダが分からない
  await page.locator('#include-path').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('shared/common.sb');
  await page.getByRole('button', { name: '取り込む', exact: true }).click();
  expect(await getEditorText(page)).toBe(withInclude(read(path.join(SET, 'spi_swc.sb')), 'shared/common.sb'));
  await expect(page.locator('#svg-wrap svg g[data-type="block"][data-id="rte"]')).toHaveCount(1);
  // 共通部は取り込み済みなので候補から消え、自分を取り込める図も無いので案内が出る
  await expect(page.locator('#include-section')).toContainText('取り込める図が無い');
});

// 「.sb 読込 ▾」でフォルダを 1 回選べば 12 枚と共通部を選び直さずに読め、本文に書くパスもフォルダから分かる(BLK-junior-20260926-1705-wish)
test('primary-01: フォルダを 1 回選ぶと全部の図と共通部が読まれ、本文に書くパスを直さずに取り込める', async ({ page }) => {
  await bootPlain(page);
  await importFolder(page, SET, path.join(SET, 'adc_swc.sb'));               // パスの順で最初の、取り込まれていない図
  await expect(page).toHaveTitle(/adc_swc\.sb/);
  await expect(page.locator('#error-bar')).not.toContainText('include');      // データフロー図の @include も共通部で解ける
  await expect(page.locator('#include-pick option:checked')).toHaveText('shared/common.sb');   // 画面の図名もフォルダの中のパス(選んだフォルダ名は付かない)
  await expect(page.locator('#include-path')).toHaveValue('shared/common.sb');   // フォルダから読んだ図は相対パスが分かる
  await page.getByRole('button', { name: '取り込む', exact: true }).click();
  expect(await getEditorText(page)).toBe(withInclude(read(path.join(SET, 'adc_swc.sb')), 'shared/common.sb'));
  await expect(page.locator('#error-bar .diag:visible', { hasText: 'rte' })).toHaveCount(0);
  await expect(page.locator('#svg-wrap svg g[data-type="block"][data-id="rte"]')).toHaveCount(1);
});

// 既存の系統と同じ構成の図を新しい系統ぶん作る: 図の名前はステータスバーの図名をダブルクリックしてその場で付け・変える(Enter 確定・Esc 取消)。
// 名前は「.sb 保存」と書き出しの名前になり、共通部を改名すると取り込んでいる図の @include 行も変わる(BLK-primary-20260929-1747-friction)
const PSET = path.join(FIXTURES, 'primary-set');
async function renameTo(page, name) {
  await page.locator('#status-file').dblclick();
  const inp = page.locator('#status-file-name');
  await expect(inp).toBeFocused();
  await inp.fill(name);
  await inp.press('Enter');
}

test('primary-01: 新規の図の名前を図名のダブルクリックで付けると、.sb 保存と SVG がその名前で出る', async ({ page }, testInfo) => {
  await bootPlain(page);
  const dir = saveDir(testInfo);
  await page.getByRole('button', { name: '新規' }).click();
  await expect(page.locator('#status-file')).toHaveText('diagram.sb');
  await page.locator('#status-file').dblclick();
  const inp = page.locator('#status-file-name');
  await expect(inp).toBeFocused();
  expect(await inp.evaluate(e => e.value.slice(e.selectionStart, e.selectionEnd))).toBe('diagram');   // 拡張子の前だけ選ばれている
  await inp.press('Escape');                                                                               // Esc は取り消す
  await expect(page.locator('#status-file')).toHaveText('diagram.sb');
  await renameTo(page, 'i2c_swc');
  await expect(page.locator('#status-file')).toHaveText('i2c_swc.sb');
  await expect(page).toHaveTitle(/^i2c_swc\.sb/);
  const [sb] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '.sb 保存' }).click()]);
  expect(sb.suggestedFilename()).toBe('i2c_swc.sb');
  const [svg] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'SVG', exact: true }).click()]);
  expect(svg.suggestedFilename()).toBe('i2c_swc.svg');
});

test('primary-01: 既存の図を開いて改名して保存すると別名で出る。共通部を改名すると取り込んでいる図の @include 行が変わる', async ({ page }, testInfo) => {
  await bootPlain(page);
  const dir = saveDir(testInfo);
  const uart = read(path.join(PSET, 'uart_swc.sb'));
  await importSb(page, [path.join(PSET, 'uart_swc.sb'), path.join(PSET, 'shared', 'common.sb')]);
  await renameTo(page, 'i2c_swc');
  await expect(page.locator('#status-file')).toContainText('i2c_swc.sb');
  await expect(page.locator('#status-file-note')).toContainText('名前を i2c_swc.sb にした');
  expect(await getEditorText(page)).toBe(uart.replace(/\r\n/g, '\n'));                     // 本文はそのまま
  const [sb] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '.sb 保存' }).click()]);
  expect(sb.suggestedFilename()).toBe('i2c_swc.sb');

  // 同じ名前の図が既にあれば理由を出して変えない(Enter なら欄に残る)
  await page.locator('#status-file').dblclick();
  await page.locator('#status-file-name').fill('common');
  await page.locator('#status-file-name').press('Enter');
  await expect(page.locator('#status-file-note')).toHaveText('名前を変えなかった: 同じ名前の図「common.sb」が既に読み込まれている');
  await expect(page.locator('#status-file-name')).toBeFocused();
  await page.locator('#status-file-name').press('Escape');
  await expect(page.locator('#status-file')).toContainText('i2c_swc.sb');

  // 共通部を開いて改名 → 取り込んでいる i2c_swc の @include 行が新しい名前になり、include のエラーは出ない
  await page.locator('#status-file').click();
  await page.locator('#search-hits .sh-file[data-path="common.sb"]').click();
  await expect(page.locator('#status-file')).toContainText('common.sb');
  await renameTo(page, 'i2c_common');
  await expect(page.locator('#status-file-note')).toContainText('@include を書き換えた図: i2c_swc.sb(1 行)');
  await expect(page.locator('#impact-head')).toContainText('この図を @include している図: i2c_swc.sb');   // 取り込んでいる図は新しい名前で当たる
  await expect(page.locator('#error-bar .diag')).toHaveCount(0);
  // Ctrl+Z 1 回で改名が戻り(取り込んでいる図の @include 行も)、Ctrl+Y でやり直せる
  await page.keyboard.press('Control+z');
  await expect(page.locator('#status-file')).toContainText('common.sb');
  await expect(page.locator('#status-file')).not.toContainText('i2c_common');
  await page.keyboard.press('Control+y');
  await expect(page.locator('#status-file')).toContainText('i2c_common.sb');
  await page.locator('#status-file').click();
  await page.locator('#search-hits .sh-file[data-path="i2c_swc.sb"]').click();
  await expect(page.locator('#status-file')).toContainText('i2c_swc.sb');
  const text = await getEditorText(page);
  expect(text).toContain('@include "shared/i2c_common.sb"');
  expect(text.split('\n').filter((l, i) => l !== uart.replace(/\r\n/g, '\n').split('\n')[i])).toEqual(['@include "shared/i2c_common.sb"']);   // 差分は 1 行
  await expect(page.locator('#error-bar .diag-error')).toHaveCount(0);
  await expect(page.locator('#svg-wrap svg g[data-type="block"][data-id="rte"]')).toHaveCount(1);
  const files = await saveAll(page, dir, 2);                                                   // 表示中の図と、変わった共通部
  expect(files.map(f => path.basename(f)).sort()).toEqual(['i2c_common.sb', 'i2c_swc.sb']);
});
