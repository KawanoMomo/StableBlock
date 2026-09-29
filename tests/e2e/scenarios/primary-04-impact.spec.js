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
