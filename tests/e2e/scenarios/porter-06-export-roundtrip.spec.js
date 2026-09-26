// porter 手順 6: Excel / Mermaid / SVG / PNG に書き出し、ブロック・接続・ラベル・グループ(と note・色)が落ちていないこと。
// 書き出し先の記法で表せないものは、黙って落とさず画面に知らせる。Excel の接続線は図形に接着され、図形を動かすと付いてくる。
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');
const { test, expect, bootPlain, importSb, saveDir, FIXTURES } = require('./_scenario');

const SRC = path.join(FIXTURES, 'owner-critique-swc.sb');

// 透過 PNG は PNG の ▾ の「透過PNG」(menuitem)。ほかはツールバーのボタン
async function download(page, name, dir) {
  const item = name === '透過PNG' ? page.getByRole('menuitem', { name: '透過PNG', exact: true }) : page.getByRole('button', { name, exact: true });
  if (name === '透過PNG') await page.locator('#png-more').click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    item.click(),
  ]);
  const file = path.join(dir, dl.suggestedFilename());
  await dl.saveAs(file);
  return file;
}

// PNG の画素数(IHDR の幅・高さ)
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

test('porter-06: SVG / PNG は画面の選択・グリッド・表示倍率を持ち込まず、本文だけで同じ絵と画素数になる', async ({ page }, testInfo) => {
  await bootPlain(page);
  await importSb(page, SRC);
  const dir = saveDir(testInfo);
  const svg = page.locator('#svg-wrap svg');
  const take = async (tag) => {
    const d = path.join(dir, tag);
    fs.mkdirSync(d, { recursive: true });
    return {
      svg: fs.readFileSync(await download(page, 'SVG', d), 'utf8'),
      png: pngSize(await download(page, 'PNG', d)),
      tpng: pngSize(await download(page, '透過PNG', d)),
    };
  };
  const plain = await take('plain');
  expect(plain.svg).toMatch(/^<svg width="960" height="520" /);           // @canvas の寸法
  expect(plain.svg).not.toMatch(/data-resize|url\(#gd\)|<pattern/);      // ハンドル・グリッドの点が無い
  expect(plain.png).toEqual({ w: 1920, h: 1040 });                         // @canvas × 2

  // block を 1 つ選び、「+」で 2 回拡大してから書き出しても同じ
  await svg.locator('g[data-type="block"][data-id="spiapi"]').click();
  await expect(svg.locator('[data-resize]').first()).toBeAttached();
  const before = await svg.getAttribute('width');
  await page.getByRole('button', { name: '+', exact: true }).click();
  await page.getByRole('button', { name: '+', exact: true }).click();
  await expect(svg).not.toHaveAttribute('width', before);
  const zoomed = await take('zoomed');
  expect(zoomed.svg).toBe(plain.svg);
  expect(zoomed.png).toEqual(plain.png);
  expect(zoomed.tpng).toEqual(plain.png);
});

test('porter-06: Mermaid に note・色・ラベルが残り、表せないものは画面に出る', async ({ page }, testInfo) => {
  await bootPlain(page);
  await importSb(page, SRC);
  const file = await download(page, 'Mermaid', saveDir(testInfo));
  const mmd = fs.readFileSync(file, 'utf8');

  expect(mmd.startsWith('flowchart TD\n')).toBe(true);
  expect(mmd).toContain('subgraph spi_driver["SPI Driver"]');
  for (const id of ['spiapi', 'spicfg', 'spijob', 'spiseq', 'spihw', 'spiirq', 'spidma', 'spidet']) expect(mmd).toMatch(new RegExp(`^\\s+${id}\\("`, 'm'));
  expect(mmd).toContain('memo>"SPI は DMA 転送を既定にする"]');           // note
  expect(mmd).toContain('spiseq -->|"frame"| spihw');                     // ラベル
  expect(mmd).toContain('memo -.-> spidma');                              // note との接続
  expect(mmd).toMatch(/^  style spidma fill:#EF4444/m);                   // block の色
  expect(mmd).toMatch(/^  style spi_driver fill:#F1F5F9,stroke:#94A3B8$/m);
  expect(mmd).toMatch(/^  linkStyle 2 stroke:#1E293B/m);                  // 接続の色
  expect(mmd).not.toMatch(/\bzz\b/);                                      // 存在しない ID のノードを作らない

  const report = page.locator('#export-report');
  await expect(report).toBeVisible();
  await expect(report).toContainText('Mermaid に書き出せなかったもの');
  await expect(report).toContainText('spiapi -> zz');
  await expect(report).toContainText('座標・大きさ');
  await report.click();                                                  // クリックで閉じる
  await expect(report).toBeHidden();
});

test('porter-06: Excel の接続線は図形に接着され、落ちた接続は画面に出る', async ({ page }, testInfo) => {
  await bootPlain(page);
  await importSb(page, SRC);
  const file = await download(page, 'Excel', saveDir(testInfo));
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const xml = await zip.file('xl/drawings/drawing1.xml').async('string');

  // shape id → 名前(block:spiapi など)
  const names = {};
  for (const m of xml.matchAll(/<xdr:cNvPr id="(\d+)" name="([^"]+)"\/>/g)) names[m[1]] = m[2];
  const cxns = [...xml.matchAll(/<xdr:cxnSp macro="">([\s\S]*?)<\/xdr:cxnSp>/g)].map(m => m[1]);
  expect(cxns.length).toBe(4);                                            // zz への 1 本は描けない
  const glued = cxns.map(c => {
    const st = c.match(/<a:stCxn id="(\d+)" idx="([0-3])"\/>/), en = c.match(/<a:endCxn id="(\d+)" idx="([0-3])"\/>/);
    expect(st, '始点が図形に接着されていない').not.toBeNull();
    expect(en, '終点が図形に接着されていない').not.toBeNull();
    return `${names[st[1]]} -> ${names[en[1]]}`;
  });
  expect(glued).toEqual(expect.arrayContaining([
    'block:spiseq -> block:spihw', 'block:spiapi -> block:spidet', 'block:spicfg -> block:spihw', 'note:memo -> block:spidma',
  ]));

  // 接続のラベルは block より後(上)に置かれ、Excel で開いても block に隠れない
  const order = [...xml.matchAll(/name="(block|connlabel):[^"]*"/g)].map(m => m[1]);
  expect(order).toContain('connlabel');
  expect(order.lastIndexOf('block')).toBeLessThan(order.indexOf('connlabel'));

  const report = page.locator('#export-report');
  await expect(report).toBeVisible();
  await expect(report).toContainText('Excel に書き出せなかったもの(1 件)');
  await expect(report).toContainText('spiapi -> zz');
  await expect(report).not.toContainText('線の形');                       // 線の形は Excel の曲線コネクタで載る
  // 画面の既定は曲線。Excel でも曲線のコネクタで出す(BLK-porter-20260926-1205-1)
  expect(cxns.map(c => c.match(/prst="(\w+)"/)[1])).toEqual(Array(4).fill('curvedConnector3'));
  // 図形の id は 2 から(1 から振ると Excel が振り直し、接着先がずれる)
  expect(Math.min(...Object.keys(names).map(Number))).toBe(2);
});

// block の太枠(style=bold)・破線枠(style=dashed)と接続の線の形は Excel でも画面と同じ。Excel で表せない lpos= は接続ごとに画面に出る
// (BLK-builder-20260926-1230-1 / BLK-porter-20260926-1205-1)
test('porter-06: block の太枠・破線枠と線の形は Excel でも画面と同じで、表せない lpos= は接続ごとに知らせる', async ({ page }, testInfo) => {
  await bootPlain(page);
  await importSb(page, path.join(FIXTURES, 'porter-styles.sb'));
  const svg = page.locator('#svg-wrap svg');
  await expect(svg.locator('g[data-type="block"][data-id="pay"] rect')).toHaveAttribute('stroke-width', '2.5');
  await expect(svg.locator('g[data-type="block"][data-id="old"] rect')).toHaveAttribute('stroke-dasharray', /\d/);

  const zip = await JSZip.loadAsync(fs.readFileSync(await download(page, 'Excel', saveDir(testInfo))));
  const xml = await zip.file('xl/drawings/drawing1.xml').async('string');
  const shape = id => xml.match(new RegExp(`name="block:${id}"[\\s\\S]*?</xdr:sp>`))[0];
  expect(shape('pay')).toMatch(/<a:ln w="23812"><a:solidFill><a:srgbClr val="10B981"\/><\/a:solidFill><\/a:ln>/);   // 2.5px
  expect(shape('old')).toMatch(/<a:ln><a:solidFill><a:srgbClr val="94A3B8"\/><\/a:solidFill><a:prstDash val="dash"\/><\/a:ln>/);
  expect(shape('api')).toContain('<a:ln><a:noFill/></a:ln>');

  const conn = n => xml.match(new RegExp(`name="conn:${n}"[\\s\\S]*?prst="(\\w+)"`))[1];
  expect(conn(0)).toBe('curvedConnector3');                                // pay -> old: 画面の既定の曲線
  expect(conn(1)).toBe('straightConnector1');                              // api -> pay route=straight

  const report = page.locator('#export-report');
  await expect(report).toBeVisible();
  await expect(report).toContainText('Excel に書き出せなかったもの(1 件)');
  await expect(report).toContainText('接続 pay -> old の lpos=top(Excel ではラベルを線の中点に置く)');
});

// ラベル中の二重引用符は SVG / Mermaid / Excel に引用符のまま出る(BLK-porter-20260926-0617)
test('porter-06: ラベルの " は SVG / Mermaid / Excel に引用符のまま出る', async ({ page }, testInfo) => {
  await bootPlain(page);
  await importSb(page, path.join(FIXTURES, 'porter-quoted.sb'));
  const dir = saveDir(testInfo);
  const svgText = fs.readFileSync(await download(page, 'SVG', dir), 'utf8');
  expect(svgText).toMatch(/>Block (&quot;|")quoted(&quot;|") label</);
  expect(svgText).toMatch(/>say (&quot;|")ref(&quot;|")</);
  const mmd = fs.readFileSync(await download(page, 'Mermaid', dir), 'utf8');
  expect(mmd).toContain('id_2a("Block #quot;quoted#quot; label")');
  expect(mmd).toContain('id_2a -->|"say #quot;ref#quot;"| a_1_b_2');
  const zip = await JSZip.loadAsync(fs.readFileSync(await download(page, 'Excel', dir)));
  const xml = await zip.file('xl/drawings/drawing1.xml').async('string');
  expect(xml).toContain('<a:t>Block &quot;quoted&quot; label</a:t>');
});
