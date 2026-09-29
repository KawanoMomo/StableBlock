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

// 接続の lpos=diagonal、block の round=big、接続の width=thick(取れない値): 描く位置・形だけ既定に倒し、その行に実際に描く値が出る。
// 無変更で Export → バイト一致(本文の値は書き換えない)(BLK-porter-20260929-0511)
test('porter-03: 取れない lpos / round / width は既定で描かれ、その行に理由が出て、無変更で Export → バイト一致', async ({ page }, testInfo) => {
  const SRC = path.join(FIXTURES, 'porter-unknown-values.sb');
  const original = fs.readFileSync(SRC);
  await bootPlain(page);
  await importSb(page, SRC);
  const svg = page.locator('#svg-wrap svg');
  await expect(svg.locator('g[data-type="block"]')).toHaveCount(2);
  await expect(svg.locator('g.conn-label')).toHaveText(['斜め置き']);
  const bar = page.locator('#error-bar');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('L3: round=big は使えない。角の丸みを既定の 4 で描く(使える値: 0 以上の整数)');
  await expect(bar).toContainText('L5: lpos=diagonal は使えない。ラベルを線の右に置く(使える値: right / left / top / bottom / center)');
  await expect(bar).toContainText('L5: width=thick は使えない。線の太さを既定の 1.5 で描く(使える値: 0 以上の数)');
  await expect(page.locator('#status')).toContainText('Warn: 3');

  const { bytes } = await exportSb(page, saveDir(testInfo));
  expect(bytes.equals(original), '保存した .sb が元と違う').toBe(true);   // 値は書き換えない

  // 本文で取れる値に直すと警告が消える
  await page.locator('#editor').fill(original.toString('utf8').replace('round=big', 'round=8').replace('lpos=diagonal', 'lpos=top').replace('width=thick', 'width=2'));
  await expect(bar).toBeHidden();
});

// 接続のラベルを style= / lpos= / color= / width= の後ろ・間に書いた図(既存の設計書の書き方): 警告無しでラベルが描かれ、無変更で Export → バイト一致。
// 接続パネルでラベルを直すと、書いた場所のまま変わる(先頭に 2 つ目を足さない)(BLK-porter-20260929-2029)
test('porter-03: 属性の後ろに書いた接続のラベルも描かれ、無変更で Export → バイト一致、直すとその場所で変わる', async ({ page }, testInfo) => {
  const dir = saveDir(testInfo);
  const SRC = path.join(dir, 'trailing-label.sb');
  const text = [
    '@canvas grid=10 width=500 height=240',
    'block x "X" at 2,2 size 6x3',
    'block y "Y" at 12,2 size 6x3',
    'block z "Z" at 2,12 size 6x3',
    'x -> y width=2 style=dashed color=#EF4444 "先"',
    'y -> z "後" color=#10B981 width=3',
    'z -> x route=ortho lpos=bottom "戻り"  # 注 "memo"',
  ].join('\n') + '\n';
  fs.writeFileSync(SRC, text);
  const original = fs.readFileSync(SRC);
  await bootPlain(page);
  await importSb(page, SRC);
  const svg = page.locator('#svg-wrap svg');
  await expect(svg.locator('g[data-type="block"]')).toHaveCount(3);
  for (const l of ['先', '後', '戻り']) await expect(svg.locator('text', { hasText: new RegExp(`^${l}$`) })).toHaveCount(1);
  await expect(svg.locator('text', { hasText: 'memo' })).toHaveCount(0);   // 行末コメントの中の引用はラベルではない
  await expect(page.locator('#error-bar')).toBeHidden();
  await expect(page.locator('#status')).not.toContainText('Warn:');

  const { bytes } = await exportSb(page, dir);
  expect(bytes.equals(original), '保存した .sb が元と違う').toBe(true);

  // x と y を選び、接続パネルのラベル欄で直す: 属性の後ろのラベルがその場所で変わる
  await svg.locator('g[data-type="block"][data-id="x"]').click();
  await svg.locator('g[data-type="block"][data-id="y"]').click({ modifiers: ['Shift'] });
  const label = page.locator('#prop-content input.conn-label');
  await expect(label).toHaveValue('先');
  await label.fill('先頭');
  await expect.poll(() => page.locator('#editor').inputValue()).toContain('x -> y width=2 style=dashed color=#EF4444 "先頭"\n');
  await expect(svg.locator('text', { hasText: /^先頭$/ })).toHaveCount(1);
});

// 接続ラベルの `\n`(README の「ラベル内改行」): block・note と同じく改行して描き、「\n」の文字を描かない。白地は 2 行を覆う。
// 無変更で Export → バイト一致(本文の \n はそのまま)(BLK-porter-20260930-0109)
test('porter-03: 接続ラベルの \\n は改行して描かれ、白地が 2 行を覆い、無変更で Export → バイト一致', async ({ page }, testInfo) => {
  const dir = saveDir(testInfo);
  const SRC = path.join(dir, 'conn-label-newline.sb');
  fs.writeFileSync(SRC, [
    '@canvas width=400 height=160 grid=20',
    'block a "A" at 1,1 size 5x3',
    'block b "B" at 12,1 size 5x3',
    'a -> b "call\\nasync"',
  ].join('\n') + '\n');
  const original = fs.readFileSync(SRC);
  await bootPlain(page);
  await importSb(page, SRC);
  const svg = page.locator('#svg-wrap svg');
  const lbl = svg.locator('g.conn-label');
  await expect(lbl).toHaveCount(1);
  await expect(lbl.locator('text')).toHaveText(['call', 'async']);
  await expect(svg.locator('text', { hasText: '\\' })).toHaveCount(0);
  await expect(page.locator('#error-bar')).toBeHidden();
  await expect(page.locator('#status')).not.toContainText('Warn:');
  // 実際の描画: 2 行目は 1 行目の下にあり、白地が両方の行を覆う
  const t1 = await lbl.locator('text').nth(0).boundingBox();
  const t2 = await lbl.locator('text').nth(1).boundingBox();
  const bg = await lbl.locator('rect').boundingBox();
  expect(t2.y).toBeGreaterThan(t1.y + t1.height / 2);
  for (const t of [t1, t2]) {
    expect(t.y).toBeGreaterThanOrEqual(bg.y - 1);
    expect(t.y + t.height).toBeLessThanOrEqual(bg.y + bg.height + 1);
    expect(t.x + t.width).toBeLessThanOrEqual(bg.x + bg.width + 1);
  }

  const { bytes } = await exportSb(page, dir);
  expect(bytes.equals(original), '保存した .sb が元と違う').toBe(true);
});
