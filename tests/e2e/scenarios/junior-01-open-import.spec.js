// junior 手順 1: 先輩(primary)の .sb を GUI の Import で開き、構成を眺める。
// 開いた図のブロック・グループの数が DSL の行数と一致し、本文欄に DSL がそのまま出ていること。
const fs = require('node:fs');
const path = require('node:path');
const { test, expect, bootPlain, importSb, getEditorText, FIXTURES } = require('./_scenario');

const SENPAI = path.join(FIXTURES, 'primary-spi_swc.sb');

test('junior-01: 先輩の .sb を Import で開くと、ブロック数が DSL と一致する', async ({ page }) => {
  const text = fs.readFileSync(SENPAI, 'utf8');
  const count = kw => text.split('\n').filter(l => new RegExp(`^\\s*${kw}\\s`).test(l)).length;

  await bootPlain(page);
  await importSb(page, SENPAI);

  expect(await getEditorText(page)).toBe(text.replace(/\r\n/g, '\n'));
  await expect(page.locator('#error-bar')).toBeHidden();
  const svg = page.locator('#svg-wrap svg');
  await expect(svg.locator('g[data-type="block"]')).toHaveCount(count('block'));
  await expect(svg.locator('g[data-type="group"]')).toHaveCount(count('group'));
  // note も既定で描かれている(注釈の表示を切り替えなくても見える)
  expect(count('note')).toBe(1);
  await expect(svg.locator('g[data-type="note"]')).toHaveCount(count('note'));
  await expect(svg.locator('g[data-type="note"][data-id="memo"]')).toBeVisible();
  expect(count('block')).toBe(8);

  // 眺める: 手本のブロックをクリックすると選択され、プロパティパネルにその名前が出る
  await svg.locator('g[data-type="block"][data-id="spi_d"]').click();
  await expect(page.locator('#prop-content')).toContainText('spi_d');
});
