// primary 手順 4: 仕様変更で影響範囲を洗う。shared/common.sb の RTE を動かし、include している 12 枚のうちどの図で接続線が
// ブロックを横切る・重なるようになったかを、図を 1 枚ずつ開かずに(CLI にも出ずに)把握する。
// 作図 UI だけで: 「.sb 読込」で 12 枚 + 共通部を読み、共通部を開くとエラー欄の見出しに「この図を @include している図」が出る。
// 共通部を動かすと、その編集で増えたほかの図のエラー・警告が「ほかの図: {図名} L{n}: ...」で並び(core/check の includeImpact。CLI と同じ診断)、
// 押すとその図のその行へ。ステータスバーの Warn は表示中の図の数のまま、ほかの図の分は「ほかの図 Warn」(BLK-primary-20260926-1205-wish)
const path = require('node:path');
const { test, expect, bootPlain, importSb, importFolder, FIXTURES } = require('./_scenario');

const SET = path.join(FIXTURES, 'primary-set');
const PERIPH = ['spi', 'can', 'uart', 'adc', 'timer', 'gpio'];
const DIAGRAMS = PERIPH.flatMap(p => [`${p}_swc.sb`, `${p}_dataflow.sb`]);
const COMMON = path.join(SET, 'shared', 'common.sb');

test('primary-04: 共通部の RTE を動かすと、取り込んでいる 12 枚のうち線が横切るようになった図と行がエラー欄に並び、押すとその図のその行へ', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, [...DIAGRAMS.map(f => path.join(SET, f)), COMMON]);
  await expect(page).toHaveTitle(/spi_swc\.sb/);
  await expect(page.locator('#impact-head')).toHaveCount(0);            // spi_swc を取り込んでいる図は無い

  // 共通部を開く: 図の RTE(include 先の要素)を押し、プロパティ欄の「common.sb を開く」
  await page.locator('#svg-wrap svg g[data-type="block"][data-id="rte"]').click();
  // 共有部の block のプロパティ欄は値を見せるだけで、ラベル欄・ID 欄・位置・色・削除は打てる形で出ない。直す入口は「common.sb を開く」の 1 つ
  // (打っても本文が変わらず何も知らせない欄を出さない。BLK-owner-20260927-0728-5)
  const props = page.locator('#prop-content');
  await expect(props.locator('#prop-included')).toContainText('この図からは動かせない・変えられないので common.sb で直す');
  await expect(props.locator('#prop-ro-label')).toHaveText('RTE');
  await expect(props.locator('#prop-ro-id')).toHaveText('rte');
  await expect(props.locator('input, textarea, .color-dot, .step-btn, .style-btn')).toHaveCount(0);
  await expect(props.locator('#prop-label-elsewhere')).toHaveCount(0);        // 「Enter でほかの図の同じ表示名も揃う」も出ない
  await expect(props.getByRole('button', { name: '削除' })).toHaveCount(0);
  const before = await page.locator('#editor').inputValue();
  await page.keyboard.type('RTE2');                                            // 選んだまま打っても、その場編集は開かず本文も変わらない
  await expect(page.locator('#inline-label')).toHaveCount(0);
  await expect(page.locator('#editor')).toHaveValue(before);
  await expect(page).toHaveTitle(/spi_swc\.sb/);
  await page.getByRole('button', { name: 'common.sb を開く' }).click();
  await expect(page).toHaveTitle(/common\.sb/);
  const head = page.locator('#impact-head');
  await expect(head).toBeVisible();
  await expect(head).toContainText('この図を @include している図: ');
  for (const f of DIAGRAMS) await expect(head).toContainText(f);
  await expect(page.locator('#error-bar .diag-other')).toHaveCount(0);

  // RTE を 1 列右へ(矢印キー 1 回): どの図にも横切り・重なりは増えない、と分かる
  await page.locator('#svg-wrap svg g[data-type="block"][data-id="rte"]').click();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#editor')).toHaveValue(/block rte "RTE" at 21,2 /);
  await expect(head).toContainText('読み込んだ時から増えたエラー・警告は無い');
  await expect(page.locator('#error-bar .diag-other')).toHaveCount(0);
  await expect(page.locator('#status-impact-warn')).toHaveCount(0);

  // さらに OS の右下(30,11)へ: 構成図 6 枚の「Drv -> rte」が OS を横切るようになる。データフロー図 6 枚は横切らない
  for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowDown');
  await expect(page.locator('#editor')).toHaveValue(/block rte "RTE" at 30,11 /);
  const others = page.locator('#error-bar .diag-other');
  await expect(others).toHaveCount(6);
  expect((await others.evaluateAll(els => els.map(e => `${e.dataset.path}:${e.dataset.line}`))).sort()).toEqual(
    ['adc_swc.sb:5', 'can_swc.sb:5', 'gpio_swc.sb:5', 'spi_swc.sb:6', 'timer_swc.sb:5', 'uart_swc.sb:5']);
  const spi = others.filter({ hasText: 'spi_swc.sb' });
  await expect(spi).toHaveText('ほかの図: spi_swc.sb L6: 接続「SpiDrv -> rte」の線が block「os」(shared/common.sb L4)の上を横切る');
  await expect(head).not.toContainText('増えたエラー・警告は無い');
  // ステータスバー: 表示中の図(共通部)の Warn は出ず、ほかの図の分は別の表記
  await expect(page.locator('#status span', { hasText: /^Warn:/ })).toHaveCount(0);
  await expect(page.locator('#status-impact-warn')).toHaveText('ほかの図 Warn: 6');

  // 押すとその図が開き、その行(接続の行)に印が付いて接続の両端が選ばれる
  await spi.click();
  await expect(page).toHaveTitle(/spi_swc\.sb/);
  await expect(page.locator('#line-nums .ln-hit')).toHaveText('6');
  await expect(page.locator('#error-bar .diag-warn', { hasText: 'L6: 接続「SpiDrv -> rte」の線が block「os」' })).toHaveCount(1);
  expect(await page.evaluate(() => sel.map(s => s.id))).toEqual(['SpiDrv', 'rte']);   // eslint-disable-line no-undef
});

// エラー欄に出る図名はどれも押すとその図(行があればその行)を開く(BLK-owner-20260926-1525-1)。見出しの「この図を @include している図」の図名と、
// 取り込み側の診断の文末に出る include 先の場所「(shared/common.sb L6)」
test('primary-04: エラー欄の図名(@include している図・include 先の場所)を押すとその図を開く', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, [...DIAGRAMS.map(f => path.join(SET, f)), COMMON]);
  await expect(page).toHaveTitle(/spi_swc\.sb/);

  // SpiDrv を RTE と OS の間(20,5)へ: 共通部の「rte -> os」の線が SpiDrv を横切り、診断は共通部の行から来る
  await page.locator('#svg-wrap svg g[data-type="block"][data-id="SpiDrv"]').click();
  for (let i = 0; i < 16; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await expect(page.locator('#editor')).toHaveValue(/block SpiDrv "SpiDrv" at 20,5 /);
  const diag = page.locator('#error-bar .diag-warn', { hasText: '接続「rte -> os」の線が block「SpiDrv」(L4)の上を横切る' });
  await expect(diag).toHaveText('L3: 接続「rte -> os」の線が block「SpiDrv」(L4)の上を横切る(shared/common.sb L6)');
  await diag.getByRole('button', { name: 'shared/common.sb L6' }).click();
  await expect(page).toHaveTitle(/common\.sb/);
  await expect(page.locator('#line-nums .ln-hit')).toHaveText('6');
  expect(await page.evaluate(() => sel.map(s => s.id))).toEqual(['rte', 'os']);   // eslint-disable-line no-undef

  // 見出しの「この図を @include している図」の図名を押すとその図が開く
  const head = page.locator('#impact-head');
  await expect(head).toContainText('この図を @include している図: ');
  await head.getByRole('button', { name: 'adc_swc.sb', exact: true }).click();
  await expect(page).toHaveTitle(/adc_swc\.sb/);
  await expect(page.locator('#status-file')).toContainText('adc_swc.sb');
});

// primary の図は @include が本文の後ろ(L16)にある。共通部の block を取り込み側の block に重ねた診断は共通部の行に付くが、相手が取り込み側の
// 行なので取り込み側の図の診断として数える。「増えたものは無い」と言い切らない(BLK-owner-20260926-2005-1)
test('primary-04: @include が本文の後ろの図で、共通部の OS を取り込み側の Drv にドラッグで重ねると、取り込み側の行で並ぶ', async ({ page }) => {
  const TAIL = path.join(FIXTURES, 'primary-tail');
  await bootPlain(page);
  await importFolder(page, TAIL, path.join(TAIL, 'adc_swc.sb'));
  await page.locator('#svg-wrap svg g[data-type="block"][data-id="rte"]').click();
  await page.getByRole('button', { name: 'common.sb を開く' }).click();
  await expect(page).toHaveTitle(/common\.sb/);
  const head = page.locator('#impact-head');
  await expect(head).toContainText('この図を @include している図: adc_swc.sb、can_swc.sb');

  // OS を実マウスでドラッグし、取り込み側の Drv と同じ 4,4 に置く(Drv は共通部の図には無いので、グリッドの大きさで動かす)
  const os = page.locator('#svg-wrap svg g[data-type="block"][data-id="os"] rect').first();
  const rte = page.locator('#svg-wrap svg g[data-type="block"][data-id="rte"] rect').first();
  const bo = await os.boundingBox(), br = await rte.boundingBox();
  const cell = br.width / 8;                                                   // RTE は幅 8 グリッド
  const sx = bo.x + bo.width / 2, sy = bo.y + bo.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx - 16 * cell, sy - 2 * cell, { steps: 5 });
  await page.mouse.move(sx - 32 * cell, sy - 4 * cell, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#editor')).toHaveValue(/block os "OS" at 4,4 /);

  const overlap = page.locator('#error-bar .diag-other', { hasText: '重なっている' });
  await expect(overlap).toHaveCount(2);
  expect(await overlap.evaluateAll(els => els.map(e => `${e.dataset.path}:${e.dataset.line}`))).toEqual(['adc_swc.sb:14', 'can_swc.sb:14']);
  await expect(overlap.first()).toHaveText('ほかの図: adc_swc.sb L14: block「os」が block「adcdrv」(L14)に重なっている(shared/common.sb L15)');
  await expect(head).not.toContainText('増えたエラー・警告は無い');
  await expect(page.locator('#status-impact-warn')).toContainText('ほかの図 Warn:');

  // 押すと取り込み側の図の Drv の行(L14)へ
  await overlap.first().click();
  await expect(page).toHaveTitle(/adc_swc\.sb/);
  await expect(page.locator('#line-nums .ln-hit')).toHaveText('14');
});

// 手順 4 の場面「不具合対応で過去の版を探す」: 過去の版と今の版(同じ名前の .sb)を一緒に読み、ステータスバーの図名の一覧の
// 「今の図と比べる」でプレビューを左右 2 面にする。左に選んだ図・右に今の図、変わった要素に印、下に行の差分、見出しに 2 つの図名。
// 差分が無ければ見出しに「変更なし」。Esc か「閉じる」で元の 1 面に戻る(BLK-primary-20260929-0005-wish。拡張の Visual Diff と同じ core/diff・core/render)
test('primary-04: 過去の版と今の版を一緒に読み、図名の一覧の「今の図と比べる」で左右に並べて変わった要素と行を見る', async ({ page }, testInfo) => {
  const fs = require('node:fs');
  const now = fs.readFileSync(path.join(SET, 'adc_swc.sb'), 'utf8');
  const common = fs.readFileSync(COMMON, 'utf8');
  const past = now.replace('block AdcDrv "AdcDrv" at 4,2 size 8x3', 'block AdcDrv "AdcDrv" at 4,8 size 8x3').replace(/^AdcDrv -> rte.*\r?\n/m, '');
  expect(past).not.toBe(now);
  const root = testInfo.outputPath('versions');
  for (const [dir, text] of [['now', now], ['past', past], ['same', now]]) {
    fs.mkdirSync(path.join(root, dir, 'shared'), { recursive: true });
    fs.writeFileSync(path.join(root, dir, 'adc_swc.sb'), text);
    fs.writeFileSync(path.join(root, dir, 'shared', 'common.sb'), common);
  }
  await bootPlain(page);
  await importFolder(page, root, path.join(root, 'now', 'adc_swc.sb'));

  // 同じ名前の図が一覧に区別できる名前(フォルダ付き)で並び、今の図以外に「今の図と比べる」
  await page.locator('#status-file').click();
  const hits = page.locator('#search-hits');
  await expect(hits.locator('.sh-file[data-path="past/adc_swc.sb"]')).toContainText('past/adc_swc.sb');
  await expect(hits.locator('.sh-file[data-path="same/adc_swc.sb"]')).toContainText('same/adc_swc.sb');
  await expect(hits.locator('.sh-compare[data-path="now/adc_swc.sb"]')).toHaveCount(0);
  await hits.locator('.sh-compare[data-path="past/adc_swc.sb"]').click();

  const view = page.locator('#compare-view');
  await expect(view).toBeVisible();
  await expect(view.locator('#compare-title')).toHaveText('past/adc_swc.sb(左) と now/adc_swc.sb(右・今の図)を比べている');
  // 左は選んだ図(AdcDrv が下の位置)、右は今の図。どちらも共通部(include 先)の rte まで描き、変わった要素に印
  await expect(view.locator('#compare-left svg g[data-type="block"][data-id="rte"]')).toHaveCount(1);
  await expect(view.locator('#compare-left svg rect[data-changed="AdcDrv"]')).toHaveCount(1);
  await expect(view.locator('#compare-right svg rect[data-changed="AdcDrv"]')).toHaveCount(1);
  await expect(view.locator('#compare-right svg [data-changed-conn="AdcDrv->rte"]')).toHaveCount(1);
  await expect(view.locator('#compare-left svg [data-changed-conn]')).toHaveCount(0);
  await expect(view.locator('#compare-lines .del')).toContainText('- block AdcDrv "AdcDrv" at 4,8 size 8x3');
  await expect(view.locator('#compare-lines .add').filter({ hasText: 'AdcDrv -> rte' })).toHaveCount(1);
  await expect(view.locator('#compare-count')).toHaveText('-1 +2');

  // Esc で元の 1 面に戻る(表示中の図・本文はそのまま)
  await page.keyboard.press('Escape');
  await expect(view).toBeHidden();
  await expect(page.locator('#svg-wrap svg')).toBeVisible();
  await expect(page.locator('#status-file')).toContainText('adc_swc.sb');
  await expect(page.locator('#editor')).toHaveValue(now.replace(/\r\n/g, '\n'));

  // 同じ本文の図と比べると見出しに「変更なし」。「閉じる」でも戻る
  await page.locator('#status-file').click();
  await hits.locator('.sh-compare[data-path="same/adc_swc.sb"]').click();
  await expect(view.locator('#compare-title')).toHaveText('same/adc_swc.sb(左) と now/adc_swc.sb(右・今の図)を比べている — 変更なし');
  await expect(view.locator('#compare-lines')).toContainText('差分なし');
  await expect(view.locator('svg [data-changed], svg [data-changed-conn]')).toHaveCount(0);
  await view.getByRole('button', { name: '閉じる' }).click();
  await expect(view).toBeHidden();
});
