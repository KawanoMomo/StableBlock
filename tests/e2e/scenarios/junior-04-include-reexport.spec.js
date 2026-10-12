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

// PNG の ▾「コピー」は画面の見た目のまま: 「◎ 未接続」で薄めた要素はコピーした画像でも同じ薄さ、薄めていないときは同じ色
// (選択の枠・グリッドの点・表示倍率は入らない)。クリップボードの画像と画面のスクリーンショットの同じ場所の色を比べる(BLK-human-20261012-1432-1)
test('junior-04: PNG の ▾「コピー」でクリップボードに入る画像は、通常表示でも「◎ 未接続」の薄めでも画面と同じ色になり、「PNG」の保存もそのコピーと同じ', async ({ page }) => {
  // OS のクリップボードには触らず、画面が navigator.clipboard.write に渡した画像を受け取る
  await page.addInitScript(() => { window.__clip = []; if (navigator.clipboard) navigator.clipboard.write = async items => { window.__clip.push(items); }; });
  await bootPlain(page);
  await page.locator('#editor').fill([
    '@canvas width=640 height=320 grid=20',
    'block src "Src" at 2,2 size 8x4',
    'block dst "Dst" at 16,2 size 8x4',
    'block lone "Lone" at 2,9 size 8x4',
    'src -> dst',
  ].join('\n'));
  const svg = page.locator('#svg-wrap svg');
  await expect(svg.locator('g[data-type="block"]')).toHaveCount(3);
  // 色を見る場所: block の左上寄り(名前の文字を避ける)。図の座標(px)
  const spots = { src: [60, 60], lone: [60, 200] };
  async function screenColor(id) {
    const r = await svg.locator(`g[data-type="block"][data-id="${id}"] rect`).first().boundingBox();
    const [x, y] = spots[id], k = r.width / 160;                    // block 幅 8 マス = 160px
    const bx = r.x + (x - 40) * k, by = r.y + (y - (id === 'lone' ? 180 : 40)) * k;
    const shot = await page.screenshot({ clip: { x: Math.round(bx), y: Math.round(by), width: 1, height: 1 } });
    return pixel(shot.toString('base64'), 0, 0);
  }
  async function pixel(b64, x, y) {
    return page.evaluate(([b, px, py]) => new Promise(res => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); res([...ctx.getImageData(px, py, 1, 1).data].slice(0, 3)); }; img.src = 'data:image/png;base64,' + b; }), [b64, x, y]);
  }
  async function copyAndRead() {
    const before = await page.evaluate(() => window.__clip.length);
    await page.locator('#png-more').click();
    await page.getByRole('menuitem', { name: 'コピー', exact: true }).click();
    await page.waitForFunction(k => window.__clip.length > k, before);
    await expect(page.locator('#status-file-note')).toContainText('PNG をクリップボードにコピーした');
    const b64 = await page.evaluate(async () => {
      const blob = await window.__clip[window.__clip.length - 1][0].getType('image/png');
      return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
    });
    return b64;
  }
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 10);

  // 通常表示: コピーの色 = 画面の色(PNG は @canvas × 2 の画素)
  const normal = await copyAndRead();
  const n = { src: await pixel(normal, 120, 120), lone: await pixel(normal, 120, 400) };
  expect(near(n.src, await screenColor('src'))).toBe(true);
  expect(near(n.lone, await screenColor('lone'))).toBe(true);

  // 「◎ 未接続」: 接続の無い Lone だけが画面でもコピーでも薄まる
  await page.locator('#hl-btn').click();
  const hl = await copyAndRead();
  await expect(page.locator('#status-file-note')).toContainText('画面の見た目のまま: 未接続を薄く');
  const h = { src: await pixel(hl, 120, 120), lone: await pixel(hl, 120, 400) };
  expect(near(h.src, n.src)).toBe(true);                     // 接続のある block は薄まらない
  expect(near(h.lone, n.lone)).toBe(false);                  // 薄まった
  expect(near(h.lone, await screenColor('lone'))).toBe(true); // 画面と同じ薄さ
  expect(near(h.src, await screenColor('src'))).toBe(true);

  // 「◎ 未接続」のまま「PNG」で保存した画像も、同じ画面のコピーと同じ大きさ・同じ色(BLK-human-20261012-1432-2)。SVG も同じ薄め
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-term="export-png"]').click()]);
  const saved = fs.readFileSync(await dl.path()).toString('base64');
  expect(pngSize(await dl.path())).toEqual({ w: 1280, h: 640 });
  expect(Buffer.from(hl, 'base64').readUInt32BE(16)).toBe(1280);
  expect(near(await pixel(saved, 120, 400), h.lone)).toBe(true);
  expect(near(await pixel(saved, 120, 120), h.src)).toBe(true);
  await expect(page.locator('#status-file-note')).toContainText('diagram.png で書き出した(画面の見た目のまま: 未接続を薄く)');
  const [ds] = await Promise.all([page.waitForEvent('download'), page.locator('[data-term="export-svg"]').click()]);
  expect(fs.readFileSync(await ds.path(), 'utf8')).toMatch(/data-id="lone"[^>]*opacity="0\.15"/);

  // 「◎ 未接続」を戻せば、コピーも元の色に戻る
  await page.locator('#hl-btn').click();
  const back = await copyAndRead();
  expect(near(await pixel(back, 120, 400), n.lone)).toBe(true);
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
