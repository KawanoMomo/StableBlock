// porter 手順 3: 描画。DSL の要素が全部描かれ、正しい DSL には警告が出ない。取れない値(style=dotted など)は黙って既定に落とさず、
// その行でエラー欄・ステータスバーに理由が出る(本文はそのまま。無変更保存はバイト一致)(BLK-porter-20260929-0530)
const fs = require('node:fs');
const path = require('node:path');
const { test, expect, bootPlain, importSb, exportSb, saveDir, FIXTURES } = require('./_scenario');

test('porter-03: 取れる style / route / lpos だけの図は警告無しで全部描かれる', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, path.join(FIXTURES, 'porter-styles.sb'));
  const svg = page.locator('#svg-wrap svg');
  await expect(svg.locator('g[data-type="block"]')).toHaveCount(3);
  await expect(svg.locator('path[marker-end]')).toHaveCount(2);
  await expect(page.locator('#error-bar')).toBeHidden();
  await expect(page.locator('#status')).not.toContainText('Warn:');
});

test('porter-03: style=dotted の block は描かれ、その行に「使えない。実線で描く」と使える値が出る。無変更で Export → バイト一致', async ({ page }, testInfo) => {
  const SRC = path.join(FIXTURES, 'porter-unknown-style.sb');
  const original = fs.readFileSync(SRC);
  await bootPlain(page);
  await importSb(page, SRC);
  const svg = page.locator('#svg-wrap svg');
  await expect(svg.locator('g[data-type="block"]')).toHaveCount(2);
  await expect(svg.locator('g[data-type="block"][data-id="b"]')).toHaveCount(1);
  const bar = page.locator('#error-bar');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('L4: style=dotted は使えない。実線で描く(使える値: solid / dashed / bold)');
  await expect(bar.locator('.diag')).toHaveCount(1);
  await expect(page.locator('#status')).toContainText('Warn: 1');

  const { bytes } = await exportSb(page, saveDir(testInfo));
  expect(bytes.equals(original), '保存した .sb が元と違う').toBe(true);   // 値は書き換えない

  // 本文で取れる値に直すと警告が消える
  await page.locator('#editor').fill(original.toString('utf8').replace('style=dotted', 'style=dashed'));
  await expect(bar).toBeHidden();
});
