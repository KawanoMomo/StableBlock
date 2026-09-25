// porter 手順 5: 何も変えずに Export → .sb で保存し、元のファイルとバイト単位で一致する(改行・インデント・コメント・空行・文字コード)。
const fs = require('node:fs');
const path = require('node:path');
const { test, expect, bootPlain, importSb, exportSb, saveDir, FIXTURES } = require('./_scenario');

const SRC = path.join(FIXTURES, 'porter-roundtrip.sb');

test('porter-05: Import → 無変更で Export → バイト一致', async ({ page }, testInfo) => {
  const original = fs.readFileSync(SRC);
  expect(original.includes('\r\n')).toBe(true);   // 往復で CRLF が落ちないことも見る

  await bootPlain(page);
  await importSb(page, SRC);
  await expect(page.locator('#svg-wrap svg g[data-type="block"]')).toHaveCount(4);

  const { file, bytes } = await exportSb(page, saveDir(testInfo));
  expect(path.extname(file)).toBe('.sb');
  expect(bytes.equals(original), `保存した ${file} が元と違う`).toBe(true);
});

// @include で本体と共通部を分けた図: 読込で include 先を一緒に選ぶと描かれ、無変更保存は @include 行を残したままバイト一致。
// include 先を選ばずに読込むと、黙って落とさずに @include の行と、その先を参照する接続に理由が出て、書き出しでも知らせる
const INC_MAIN = path.join(FIXTURES, 'porter-include.sb');
const INC_COMMON = path.join(FIXTURES, 'shared', 'common.sb');

test('porter-05: @include の図を include 先と一緒に読込むと描かれ、無変更で Export → バイト一致', async ({ page }, testInfo) => {
  const original = fs.readFileSync(INC_MAIN);
  await bootPlain(page);
  await importSb(page, [INC_MAIN, INC_COMMON]);
  const svg = page.locator('#svg-wrap svg');
  await expect(svg.locator('g[data-type="block"][data-id="shared_db"]')).toHaveCount(1);
  await expect(svg.locator('g[data-type="block"]')).toHaveCount(2);
  await expect(svg.locator('path[marker-end]')).toHaveCount(1);          // ui -> shared_db
  await expect(page.locator('#error-bar')).toBeHidden();
  await expect(page.locator('#editor')).toHaveValue(/@include "shared\/common.sb"/);   // 本文は展開しない

  const { bytes } = await exportSb(page, saveDir(testInfo));
  expect(bytes.equals(original), '保存した .sb が元と違う').toBe(true);

  // 選ぶ順が逆でも、ほかのファイルから include されていない方が本体になる
  await bootPlain(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '.sb 読込' }).click()]);
  await chooser.setFiles([INC_COMMON, INC_MAIN]);
  await expect(page.locator('#editor')).toHaveValue(original.toString('utf8'));
  await expect(svg.locator('g[data-type="block"]')).toHaveCount(2);
});

test('porter-05: include 先を選ばずに読込むと、@include の行と参照する接続に理由が出て、書き出しでも知らせる', async ({ page }, testInfo) => {
  await bootPlain(page);
  await importSb(page, INC_MAIN);
  const bar = page.locator('#error-bar');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('L4: include 先「shared/common.sb」を読めない(「.sb 読込」で本体と一緒に選ぶ)');
  await expect(bar).toContainText('L3: 接続「ui -> shared_db」: 「shared_db」という ID の block / note が無い(読めていない include 先: L4「shared/common.sb」)');
  await expect(page.locator('#status')).toContainText('Err: 2');

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Mermaid', exact: true }).click()]);
  await dl.saveAs(path.join(saveDir(testInfo), dl.suggestedFilename()));
  const report = page.locator('#export-report');
  await expect(report).toBeVisible();
  await expect(report).toContainText('include 先「shared/common.sb」(L4)を読めず、その中の要素は入っていない');
  await report.click();
  const [svgDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'SVG', exact: true }).click()]);
  await svgDl.saveAs(path.join(saveDir(testInfo), svgDl.suggestedFilename()));
  await expect(report).toContainText('SVG に書き出せなかったもの');
});
