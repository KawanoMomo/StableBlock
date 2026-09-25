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
