// porter 手順 5: 何も変えずに Export → .sb で保存し、元のファイルとバイト単位で一致する(改行・インデント・コメント・空行・文字コード)。
// 保存名は読み込んだファイルの名前。
const fs = require('node:fs');
const path = require('node:path');
const { test, expect, bootPlain, importSb, exportSb, getEditorText, saveDir, FIXTURES } = require('./_scenario');

const SRC = path.join(FIXTURES, 'porter-roundtrip.sb');

test('porter-05: Import → 無変更で Export → バイト一致', async ({ page }, testInfo) => {
  const original = fs.readFileSync(SRC);
  expect(original.includes('\r\n')).toBe(true);   // 往復で CRLF が落ちないことも見る

  await bootPlain(page);
  await importSb(page, SRC);
  await expect(page.locator('#svg-wrap svg g[data-type="block"]')).toHaveCount(4);

  const { file, bytes } = await exportSb(page, saveDir(testInfo));
  expect(path.basename(file)).toBe(path.basename(SRC));   // 読み込んだ図は同じファイル名で保存される
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

// ラベルに二重引用符を含む図(`"Block \"quoted\" label"`): 読込で全部描かれ、無変更保存はバイト一致。
// GUI のラベル欄に " を打っても本文は \" で書かれて壊れない(BLK-porter-20260926-0617)
const QUOTED = path.join(FIXTURES, 'porter-quoted.sb');

test('porter-05: ラベルに \\" を含む図が描かれ、無変更で Export → バイト一致、GUI で " を打っても壊れない', async ({ page }, testInfo) => {
  const original = fs.readFileSync(QUOTED);
  await bootPlain(page);
  await importSb(page, QUOTED);
  const svg = page.locator('#svg-wrap svg');
  await expect(svg.locator('g[data-type="block"]')).toHaveCount(2);
  await expect(svg.locator('g[data-type="block"][data-id="id_2a"]')).toContainText('Block "quoted" label');
  await expect(svg.locator('g[data-type="note"][data-id="n1"]')).toContainText('"TBD" は仮');
  await expect(svg.locator('g.conn-label')).toHaveText(['say "ref"']);
  await expect(page.locator('#error-bar .diag')).toHaveCount(0);

  const { bytes } = await exportSb(page, saveDir(testInfo));
  expect(bytes.equals(original), '無変更保存が元と違う').toBe(true);

  // GUI: block を選び、ラベル欄に " を含む名前を打つ
  await svg.locator('g[data-type="block"][data-id="a_1_b_2"]').click();
  const label = page.locator('#prop-content input[oninput="setLabel(this.value)"]');
  await label.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Say "hi"');
  await expect(page.locator('#editor')).toHaveValue(/^block a_1_b_2 "Say \\"hi\\"" at 12,1 size 8x3 color=#10B981 text=#FFFFFF round=4$/m);
  await expect(svg.locator('g[data-type="block"]')).toHaveCount(2);
  await expect(svg.locator('g[data-type="block"][data-id="a_1_b_2"]')).toContainText('Say "hi"');
  await expect(page.locator('#error-bar .diag')).toHaveCount(0);
});

// note の style= は画面に効く: 書いた note は block と同じ規則(solid / dashed / bold)、書いていない note は注釈の破線枠。
// 無変更保存はバイト一致のまま、プロパティ欄のスタイルで変えると本文の style= だけが変わる(BLK-porter-20260926-1205-2)
test('porter-05: note の style=solid は実線で描かれ、無変更で Export → バイト一致、プロパティ欄で太線にすると style= だけ変わる', async ({ page }, testInfo) => {
  const SRC_NOTE = path.join(FIXTURES, 'porter-note-style.sb');
  const original = fs.readFileSync(SRC_NOTE);
  await bootPlain(page);
  await importSb(page, SRC_NOTE);
  const svg = page.locator('#svg-wrap svg');
  const memo = svg.locator('g[data-type="note"][data-id="memo"] rect');
  await expect(memo).not.toHaveAttribute('stroke-dasharray', /./);
  await expect(svg.locator('g[data-type="note"][data-id="tbd"] rect')).toHaveAttribute('stroke-dasharray', '4,2');

  const { bytes } = await exportSb(page, saveDir(testInfo));
  expect(bytes.equals(original), '無変更保存が元と違う').toBe(true);

  await svg.locator('g[data-type="note"][data-id="memo"]').click();
  await page.getByRole('button', { name: '太線', exact: true }).click();
  const after = (await getEditorText(page)).split('\n');
  const before = original.toString('utf8').replace(/\r\n/g, '\n').split('\n');
  const changed = after.map((l, i) => (l !== before[i] ? i : -1)).filter(i => i >= 0);
  expect(changed).toEqual([3]);
  expect(after[3]).toBe('note memo "実線枠のつもりの注記" at 8,1 size 8x2 color=#FFFFFF text=#374151 style=bold round=0');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#status')).toContainText('Selected: 0');   // 選択の太枠でなく style=bold の太さを見る
  await expect(svg.locator('g[data-type="note"][data-id="memo"] rect')).toHaveAttribute('stroke-width', '2.5');
});
