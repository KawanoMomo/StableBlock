#!/usr/bin/env node
// make-icon.mjs — packaging/icon.svg を 16/24/32/48/64/128/256 px の PNG に描き、1 つの icon.ico に詰める(BLK-human-20260926-2100)。
//   node packaging/make-icon.mjs      icon.svg を直したときだけ手で回し、icon.ico をコミットする(ビルドのたびには回さない)
// 描画は devDependencies の Playwright(Chromium)。ICO は PNG をそのまま入れる形式(Windows Vista 以降が読める)。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIZES = [16, 24, 32, 48, 64, 128, 256];

// PNG の並び → ICO(ICONDIR 6 バイト + ICONDIRENTRY 16 バイト × n + PNG 本体)
export function packIco(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...pngs.map(p => p.png)]);
}

const svg = readFileSync(join(HERE, 'icon.svg'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const pngs = [];
for (const size of SIZES) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg style="display:block;width:${size}px;height:${size}px" `)}</body></html>`);
  pngs.push({ size, png: await page.screenshot({ omitBackground: true }) });
}
await browser.close();
writeFileSync(join(HERE, 'icon.ico'), packIco(pngs));
console.log(`packaging/icon.ico(${SIZES.join('/')} px)`);
