// porter 手順 6: Excel / Mermaid に書き出し、ブロック・接続・ラベル・グループ(と note・色)が落ちていないこと。
// 書き出し先の記法で表せないものは、黙って落とさず画面に知らせる。Excel の接続線は図形に接着され、図形を動かすと付いてくる。
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');
const { test, expect, bootPlain, importSb, saveDir, FIXTURES } = require('./_scenario');

const SRC = path.join(FIXTURES, 'owner-critique-swc.sb');

async function download(page, name, dir) {
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name, exact: true }).click(),
  ]);
  const file = path.join(dir, dl.suggestedFilename());
  await dl.saveAs(file);
  return file;
}

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
});
