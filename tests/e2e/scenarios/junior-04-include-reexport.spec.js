// junior 手順 3〜4(場面3): 先輩の共有部を @include した自分の図を、画布を広げて重なりを避けてから「透過PNG」で再書き出しする。
// 画布は本文の @canvas が正で、共有部の @canvas に戻されない(書き出しが広げる前の高さで切れない)。共有部の block は
// この図からは動かせないので、選ぶと定義の場所と直す先が出て、そのファイルを開ける(BLK-junior-20260926-1105)
const path = require('node:path');
const fs = require('node:fs');
const { test, expect, bootPlain, importSb, getEditorText, saveDir, FIXTURES } = require('./_scenario');

const SET = path.join(FIXTURES, 'primary-set');
const MAIN = path.join(SET, 'spi_swc.sb');
const COMMON = path.join(SET, 'shared', 'common.sb');

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

test('junior-04: 共有部を include した図の画布を広げると、透過PNG も広げた高さで書き出される', async ({ page }, testInfo) => {
  await bootPlain(page);
  await importSb(page, [MAIN, COMMON]);
  const svg = page.locator('#svg-wrap svg');
  await expect(svg.locator('g[data-type="block"][data-id="rte"]')).toHaveCount(1);   // 共有部の block も描かれる
  await expect(page.locator('#status')).toContainText('960×520');

  // ツール欄の画布の高さを 780 にする(共有部の @canvas は 520 のまま)
  await svg.click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Escape');
  const h = page.locator('#canvas-h');
  await h.fill('780');
  await h.press('Enter');
  await expect(page.locator('#status')).toContainText('960×780');
  expect(await getEditorText(page)).toContain('@canvas width=960 height=780 grid=20');
  await expect(svg).toHaveAttribute('viewBox', /^0 0 960 780$/);

  await page.locator('#png-more').click();   // 透過は PNG の ▾ から
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: '透過PNG', exact: true }).click()]);
  const file = path.join(saveDir(testInfo), dl.suggestedFilename());
  await dl.saveAs(file);
  expect(pngSize(file)).toEqual({ w: 1920, h: 1560 });   // @canvas × 2。下半分が切れない
});

test('junior-04: 共有部の block を選ぶと、この図から動かせない理由と定義の場所が出て、そのファイルを開いて直せる', async ({ page }) => {
  await bootPlain(page);
  await importSb(page, [MAIN, COMMON]);
  const svg = page.locator('#svg-wrap svg');
  await svg.locator('g[data-type="block"][data-id="rte"]').click();
  const note = page.locator('#prop-included');
  await expect(note).toBeVisible();
  await expect(note).toContainText('include 先 common.sb の L3 で定義(本文 L3 の @include)。この図からは動かせない・変えられないので common.sb で直す');

  // 本文で定義した block には出ない
  const ownId = await svg.locator('g[data-type="block"]:not([data-id="rte"]):not([data-id="os"]):not([data-id="hal"])').first().getAttribute('data-id');
  await svg.locator(`g[data-type="block"][data-id="${ownId}"]`).click();
  await expect(page.locator('#prop-included')).toHaveCount(0);

  // 共有部の block から「common.sb を開く」でそのファイルを開き、同じ block が選ばれて動かせる
  await svg.locator('g[data-type="block"][data-id="rte"]').click();
  await page.getByRole('button', { name: 'common.sb を開く' }).click();
  expect(await getEditorText(page)).toBe(fs.readFileSync(COMMON, 'utf8').replace(/\r\n/g, '\n'));
  await expect(page.locator('#prop-id-now')).toHaveText('rte');
  await expect(page.locator('#prop-included')).toHaveCount(0);
  const box = await svg.locator('g[data-type="block"][data-id="rte"] rect').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  expect(await getEditorText(page)).not.toContain('block rte "RTE" at 20,2 ');
});

// 先輩の図と共通部を読み込んだまま「新規」で自分の図を起こすと、その図も一緒に開いている図の 1 枚になる。
// 「一括 ▾」の見出しの枚数と zip に自分の図が入り、ステータスバーの図名の一覧から先輩の図と行き来できる(BLK-junior-20260930-0308)
test('junior-04: 読み込んだ図のまま「新規」で起こして名前を付けた図は「一括 ▾」の枚数と zip に入り、図名の一覧から行き来できる', async ({ page }, testInfo) => {
  const JSZip = require('jszip');
  const WDT = path.join(FIXTURES, 'junior-wdt');
  await bootPlain(page);
  await importSb(page, [path.join(WDT, 'wdg_swc.sb'), path.join(WDT, 'shared', 'rte.sb'), path.join(WDT, 'shared', 'hal.sb')]);
  const props = page.locator('#prop-content');
  await page.getByRole('button', { name: '新規', exact: true }).click();
  await expect(page.locator('#status-file')).toContainText('diagram.sb');
  await expect(page.locator('#status-file')).toContainText('(4/4)');          // 一緒に開いている図の 4 枚目
  await expect(page.locator('#status-file .status-dirty')).toHaveCount(1);     // まだ保存していない
  await props.getByRole('button', { name: '取り込む', exact: true }).click();
  await props.getByRole('button', { name: '取り込む', exact: true }).click();
  await props.getByRole('button', { name: '+ グループ追加' }).click();
  await page.keyboard.type('Watchdog');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  // 図名を付ける(ダブルクリック → 打って Enter)
  await page.locator('#status-file').dblclick();
  await page.locator('#status-file-name').fill('wdt_swc');
  await page.locator('#status-file-name').press('Enter');
  await expect(page.locator('#status-file')).toContainText('wdt_swc.sb');

  // 一括 ▾: 見出しは 4 枚、zip に自分の図が入る
  await page.locator('[data-term="export-all"]').click();
  await expect(page.locator('#export-menu-head')).toHaveText('読み込んだ全部の図(4 枚)');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#export-menu [data-term="export-svg-all"]').click()]);
  const file = path.join(saveDir(testInfo), dl.suggestedFilename());
  await dl.saveAs(file);
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const names = Object.keys(zip.files).map(n => n.split('/').pop()).sort();
  expect(names).toEqual(['hal.svg', 'rte.svg', 'wdg_swc.svg', 'wdt_swc.svg']);
  const mine = await zip.file(Object.keys(zip.files).find(n => n.endsWith('wdt_swc.svg'))).async('string');
  expect(mine).toContain('Watchdog');
  expect(mine).toContain('RTE');                                                // 共通部も解決して描く
  await expect(page.locator('#export-report')).toContainText('4 枚');
  await expect(page.locator('#bulk-missing')).toHaveCount(0);

  // 図名の一覧から先輩の図を開き、自分の図へ戻れる(自分の図の中身はそのまま)
  await page.locator('#status-file').click();
  await page.locator('#search-hits .sh-file[data-path="wdg_swc.sb"]').click();
  await expect(page.locator('#status-file')).toContainText('wdg_swc.sb');
  await page.locator('#status-file').click();
  await page.locator('#search-hits .sh-file[data-path="wdt_swc.sb"]').click();
  await expect(page.locator('#status-file')).toContainText('wdt_swc.sb');
  expect(await getEditorText(page)).toMatch(/^group Watchdog "Watchdog" /m);
});
