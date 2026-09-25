// junior 手順 2: 作図 UI だけで図を作る(本文欄には触らない)。接続は「ブロックを選んで結ぶ」。
// 接続を作る入口は 2 つ選んだときの「a → b」だけ(ID を打つ from/to 欄と「色を指定して接続」は畳んだ)。色は結んだ後に「線の色」で変える。
const path = require('node:path');
const { test, expect, bootPlain, importSb, getEditorText, FIXTURES } = require('./_scenario');

const SENPAI = path.join(FIXTURES, 'primary-spi_swc.sb');

test('junior-02: 2 つ選んで「a → b」で結び、結んだ後に線の色を変える', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, SENPAI);
  const props = page.locator('#prop-content');
  const svg = page.locator('#svg-wrap svg');

  // 何も選んでいない: ID を打つ入口は無く、選んで結ぶ入口への案内が 1 行ある
  await expect(props.locator('#conn-from')).toHaveCount(0);
  await expect(props.locator('#conn-to')).toHaveCount(0);
  await expect(props.getByRole('button', { name: '接続追加' })).toHaveCount(0);
  await expect(props.locator('#conn-guide')).toContainText('a → b');

  // 2 つ選ぶ(クリック → Shift+クリック)
  await svg.locator('g[data-type="block"][data-id="app"]').click();
  await svg.locator('g[data-type="block"][data-id="dma"]').click({ modifiers: ['Shift'] });
  await expect(props).toContainText('2個のアイテムを選択中');

  // 結ぶ前: 入口は「a → b」「b → a」の 2 ボタンだけで、色点で結ぶ入口は無い
  await expect(props.getByText('色を指定して接続')).toHaveCount(0);
  const before = await getEditorText(page);
  await props.getByRole('button', { name: 'app → dma' }).click();

  // 本文の差分は色の無い 1 行だけ
  const after = await getEditorText(page);
  expect(after.startsWith(before.trimEnd())).toBe(true);
  expect(after.slice(before.trimEnd().length).trim()).toBe('app -> dma');

  // 結んだ後: 接続パネルの「線の色」で色を付ける
  await expect(props).toContainText('線の色');
  const colorRow = props.locator('.prop-sub', { hasText: '線の色' }).locator('xpath=following-sibling::div[1]');
  await colorRow.locator('.color-dot').nth(4).click();   // #EF4444
  await expect.poll(() => getEditorText(page)).toMatch(/^app -> dma color=#EF4444$/m);
  await expect(svg.locator('g[data-type="block"]')).toHaveCount(8);
});

test('junior-02: 注釈は block と同じ 1 手で置け、そのまま選んで動かせ、全選択 → Delete で消える', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, SENPAI);
  const props = page.locator('#prop-content');
  const svg = page.locator('#svg-wrap svg');

  // 何も選んでいないツール欄の「+ 注釈追加」1 回で note が入り、編集モードに入らずに選択されている
  await props.getByRole('button', { name: '+ 注釈追加' }).click();
  const added = svg.locator('g[data-type="note"][data-id^="__new_"]');
  await expect(added).toHaveCount(1);
  await expect(page.locator('#anno-edit-btn')).not.toHaveClass(/tb-anno-edit/);
  await expect(props).toContainText('__new_');

  // 通常モードのまま block も note も選べる
  await svg.locator('g[data-type="block"][data-id="app"]').click();
  await expect(props).toContainText('app');
  await svg.locator('g[data-type="note"][data-id="memo"]').click();
  await expect(props).toContainText('memo');

  // note をドラッグで動かせる(本文の note 行の座標が変わる)
  const box = await svg.locator('g[data-type="note"][data-id="memo"] rect').first().boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 10, box.y + 70, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => getEditorText(page)).not.toMatch(/^note memo "Job 単位で排他" at 35,3 /m);

  // Ctrl+A → Delete で note も含めて空になる
  await svg.locator('g[data-type="block"][data-id="app"]').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await expect(svg.locator('g[data-type="block"], g[data-type="group"], g[data-type="note"]')).toHaveCount(0);
  expect(await getEditorText(page)).not.toMatch(/^\s*note\s/m);
});

// ─── 選択: 2 つ選んで結ぶ操作を 10 本続けても、毎回 2 個選択から結べる(BLK-owner-20260925-1921-2) ───
const SRC = path.join(FIXTURES, 'junior-8blocks.sb');
const PAIRS = [['b1', 'b2'], ['b2', 'b3'], ['b3', 'b4'], ['b1', 'b5'], ['b5', 'b6'], ['b6', 'b7'], ['b7', 'b8'], ['b2', 'b6'], ['b3', 'b7'], ['b4', 'b8']];

const block = (page, id) => page.locator(`#svg-wrap svg g[data-type="block"][data-id="${id}"]`);
const status = page => page.locator('#status');

test('junior-02: 8 block に 10 本、毎回 2 個選択の状態から結べる', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, SRC);
  await expect(page.locator('#svg-wrap svg g[data-type="block"]')).toHaveCount(8);

  for (const [i, [x, y]] of PAIRS.entries()) {
    await block(page, x).click();                          // 選択済み(前の組の 2 つ目)でも、その 1 つに置き換わる
    await expect(status(page)).toContainText('Selected: 1');
    await block(page, y).click({ modifiers: ['Shift'] });
    await expect(status(page)).toContainText('Selected: 2');
    await expect(page.locator('#prop-title')).toHaveText('2個選択中');
    await page.getByRole('button', { name: `${x} → ${y}`, exact: true }).click();
    await expect(status(page)).toContainText(`Conn: ${i + 1}`);
  }
  const text = await page.locator('#editor').inputValue();
  for (const [x, y] of PAIRS) expect(text).toContain(`${x} -> ${y}`);
});

test('junior-02: Esc とプレビューの余白クリックで選択が外れる', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, SRC);

  await block(page, 'b1').click();
  await block(page, 'b2').click({ modifiers: ['Shift'] });
  await expect(status(page)).toContainText('Selected: 2');
  await page.keyboard.press('Escape');
  await expect(status(page)).toContainText('Selected: 0');
  await expect(page.locator('#prop-title')).toHaveText('ツール');

  // キャンバスの外(プレビュー欄の暗い余白)をクリック
  await block(page, 'b3').click();
  await expect(status(page)).toContainText('Selected: 1');
  const svgBox = await page.locator('#svg-wrap svg').boundingBox();
  const area = await page.locator('#preview-area').boundingBox();
  const mx = svgBox.x + 20, my = svgBox.y + svgBox.height + 40;
  expect(my).toBeLessThan(area.y + area.height - 20);        // 余白が画面にある
  await page.mouse.click(mx, my);
  await expect(status(page)).toContainText('Selected: 0');
  await expect(page.locator('#prop-title')).toHaveText('ツール');
});

test('junior-02: 本文から消えた要素はプロパティ欄と選択から消える', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, SRC);

  await block(page, 'b7').click();
  await block(page, 'b8').click({ modifiers: ['Shift'] });
  await expect(status(page)).toContainText('Selected: 2');
  const editor = page.locator('#editor');
  const drop = id => editor.inputValue().then(t => t.split('\n').filter(l => !l.startsWith(`block ${id} `)).join('\n'));
  await editor.fill(await drop('b8'));
  await expect(status(page)).toContainText('Selected: 1');
  await expect(page.locator('#prop-content')).toContainText('b7');
  await editor.fill(await drop('b7'));
  await expect(status(page)).toContainText('Selected: 0');
  await expect(page.locator('#prop-title')).toHaveText('ツール');
  await expect(page.locator('#prop-content')).not.toContainText('b7');
});

test('junior-02: ドラッグは複数選択のまま全部動き、動かさずに離したクリックだけが 1 つに絞る', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, SRC);

  await block(page, 'b1').click();
  await block(page, 'b2').click({ modifiers: ['Shift'] });
  const box = await block(page, 'b2').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 45, { steps: 5 });   // 2 グリッド下へ
  await page.mouse.up();
  await expect(status(page)).toContainText('Selected: 2');
  const text = await page.locator('#editor').inputValue();
  const y1 = +text.match(/block b1 "Spi_Api"\s+at 1,(\d+) /)[1], y2 = +text.match(/block b2 "Spi_Hw"\s+at 10,(\d+) /)[1];
  expect(y1).toBeGreaterThan(1);
  expect(y2).toBe(y1);                                         // 2 つとも同じだけ動いた

  // 動かさずに離す(クリック)と、押した 1 つに絞られる
  await block(page, 'b2').click();
  await expect(status(page)).toContainText('Selected: 1');
  await expect(page.locator('#prop-content')).toContainText('b2');
});
