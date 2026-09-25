// junior 手順 6: 書き方が分からなければ GUI のヘルプ・プロパティ・エラー表示で探す。
// エラー表示(DSL 欄の上の欄とステータスバーの Err / Warn)が、何が悪いかを理由付きで示す:
// 読めない行の理由、存在しない ID への接続、block の重なり、線が別の block の上を横切ること。
const { test, expect, bootPlain } = require('./_scenario');

const bar = page => page.locator('#error-bar');

async function setText(page, text) {
  await page.locator('#editor').fill(text);
}

test('junior-06: 書き間違えた行と存在しない ID への接続を、理由付きで示す', async ({ page }) => {
  await bootPlain(page);
  await setText(page, [
    '@canvas width=600 height=300 grid=20',
    'block a "A" at 1,1 size 4x2',
    'blok b "B" at 8,1 size 4x2',
    'block c "C" at 1,5',
    'a -> zz',
  ].join('\n'));

  await expect(bar(page)).toBeVisible();
  await expect(bar(page).locator('.diag-error')).toHaveCount(3);
  await expect(bar(page)).toContainText('L3: 「blok」は書式にない語。block の書き間違い?');
  await expect(bar(page)).toContainText('L4: block の size WxH');
  await expect(bar(page)).toContainText('書式: block ID "ラベル" at X,Y size WxH');
  await expect(bar(page)).toContainText('L5: 接続「a -> zz」: 「zz」という ID の block / note が無い');
  await expect(page.locator('#status')).toContainText('Err: 3');

  // 直すと消える
  await setText(page, [
    '@canvas width=600 height=300 grid=20',
    'block a "A" at 1,1 size 4x2',
    'block b "B" at 8,1 size 4x2',
    'a -> b',
  ].join('\n'));
  await expect(bar(page)).toBeHidden();
  await expect(page.locator('#status')).not.toContainText('Err:');
});

test('junior-06: 同じ座標の block と、別の block の上を横切る線を知らせる(描く前に分かる)', async ({ page }) => {
  await bootPlain(page);
  // owner 批評の再現: 8 block を 2 列 4 段に並べて 3 本結ぶ
  const lines = ['@canvas width=560 height=440 grid=20'];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) lines.push(`block b${r * 2 + c + 1} "B${r * 2 + c + 1}" at ${1 + c * 12},${1 + r * 5} size 8x3`);
  lines.push('b1 -> b7', 'b2 -> b3', 'b4 -> b5');
  lines.push('block dup "Dup" at 1,1 size 8x3');   // b1 と同じ座標
  await setText(page, lines.join('\n'));

  await expect(bar(page)).toBeVisible();
  await expect(bar(page).locator('.diag-error')).toHaveCount(0);
  await expect(bar(page)).toContainText('block「dup」が block「b1」(L2)に重なっている');
  await expect(bar(page)).toContainText('接続「b1 -> b7」の線が block「b3」(L4)の上を横切る');
  await expect(page.locator('#status')).toContainText('Warn:');
  await expect(page.locator('#status')).not.toContainText('Err:');

  // 横切られる block を線の脇へ動かすと、その知らせは消える
  await setText(page, lines.join('\n').replace('block b3 "B3" at 1,6', 'block b3 "B3" at 25,6').replace('block b5 "B5" at 1,11', 'block b5 "B5" at 25,11'));
  await expect(bar(page)).not.toContainText('「b1 -> b7」の線が block「b3」');
});

test('junior-06: ツールバーとプロパティ欄の入口は、名前とツールチップで何をするかを言う', async ({ page }) => {
  await bootPlain(page);
  await setText(page, [
    '@canvas width=600 height=300 grid=20',
    'group g "G" at 1,1 size 12x8',
    'block a "A" at 2,3 size 4x2',
    'block b "B" at 16,3 size 4x2',
    'a -> b',
  ].join('\n'));
  const props = page.locator('#prop-content');
  const svg = page.locator('#svg-wrap svg');

  // 略語・絵文字だけの名前は無く、ツールチップが動詞で言う
  await expect(page.locator('#hl-btn')).toHaveText('◎ 未接続を薄く');
  await expect(page.locator('#hl-btn')).toHaveAttribute('title', /薄く表示する/);
  await expect(page.getByRole('button', { name: 'PNGをコピー' })).toHaveAttribute('title', /クリップボードにコピーする/);
  await expect(page.getByRole('button', { name: '透過PNG' })).toBeVisible();
  await expect(page.locator('#search-input')).toHaveAttribute('placeholder', '🔍 ID・ラベルで検索');

  // 線の形: 押すと何を切り替えたかと今の値が出る
  const lm = page.locator('#line-mode-btn');
  await expect(lm).toHaveText('⌇ 線の形: 曲線');
  await lm.click();
  await expect(lm).toHaveText('╱ 線の形: 直線');
  await lm.click();
  await expect(lm).toHaveText('⊾ 線の形: 直角');
  await lm.click();

  // block を選ぶ: 種類とスタイルは日本語
  await svg.locator('g[data-type="block"][data-id="a"]').click();
  await expect(props).toContainText('ブロック');
  for (const n of ['実線', '破線', '太線']) await expect(props.getByRole('button', { name: n, exact: true })).toBeVisible();
  await props.getByRole('button', { name: '破線', exact: true }).click();
  await expect(page.locator('#editor')).toHaveValue(/block a "A" at 2,3 size 4x2 .*style=dashed/);

  // group を選ぶ: 中に足す入口はツール欄の「+ ブロック追加」と別の名前で、半角の +
  await page.keyboard.press('Escape');
  await svg.locator('g[data-type="group"][data-id="g"]').click({ position: { x: 20, y: 8 } });
  await expect(props.getByRole('button', { name: '+ グループ内にブロック追加' })).toHaveAttribute('title', /グループの中/);
  await expect(props.getByText('＋')).toHaveCount(0);
});
