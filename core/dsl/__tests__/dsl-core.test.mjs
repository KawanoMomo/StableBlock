import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseDSL, serializeDSL } from '../dsl-core.mjs';
import { parseLpos, hasLpos } from '../../label/label-core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(__dirname, '..', '..', '..', 'stableblock.html'), 'utf8');

// stableblock.html の parseDSL をそのまま取り出す(ドリフト検出用)
function htmlParseDSL() {
  const start = HTML.indexOf('function parseDSL(text){');
  assert.ok(start >= 0, 'stableblock.html に parseDSL が見つからない');
  const end = HTML.indexOf('\n}\n', start);
  const src = HTML.slice(start, end + 2);
  return new Function('window', `${src}\nreturn parseDSL;`)({ StableBlockLabel: { parseLpos, hasLpos } });
}
const DEFAULT_DSL = HTML.match(/let dsl = `([\s\S]*?)`;/)[1];

const SAMPLES = {
  default: DEFAULT_DSL,
  crlf: '@canvas width=400 height=200 grid=20\r\nblock ui "UI" at 1,1 size 5x3 color=#3B82F6 text=#FFFFFF round=4\r\nblock core "Core" at 10,1 size 5x3\r\nui -> core "request"\r\n',
  canvasRoute: '@canvas width=400 route=ortho grid=20\nblock a "A" at 1,1 size 2x2\nblock b "B" at 6,1 size 2x2\na -> b\n',
  bom: '﻿# 先頭に BOM\n@canvas width=400\ngroup g "G" at 0,0 size 10x10 color=#EEF2FF border=#818CF8\n',
  mixed: '  block a "A\\nB" at 1.5,2 size 4x2 style=dashed border=#000\n\tnote n "メモ" at 0,0 size 3x1\na --> n "l" color=#f00 width=2 route=ortho lpos=top\nb -> c\nゴミ行\nblock a "dup" at 0,0 size 1x1\n@include "x.sb"\n',
};

function strip(p) { return JSON.parse(JSON.stringify(p)); }

test('parseDSL は stableblock.html の parseDSL と同じ結果を返す(ドリフト検出)', () => {
  const htmlParse = htmlParseDSL();
  for (const [name, text] of Object.entries(SAMPLES)) {
    assert.deepEqual(strip(parseDSL(text)), strip(htmlParse(text)), `sample: ${name}`);
  }
});

test('serializeDSL: 整列の空白・コメント・空行・CRLF・BOM を含めてバイト一致で往復する', () => {
  for (const [name, text] of Object.entries(SAMPLES)) {
    assert.equal(serializeDSL(parseDSL(text)), text, `sample: ${name}`);
  }
});

test('serializeDSL: parser が読んだ値を書き戻す(座標を変えるとその数字だけが変わる)', () => {
  const text = 'block ui    "UI"   at 2,3 size 9x3 color=#6366F1\nui -> ui\n';
  const p = parseDSL(text);
  p.blockMap.ui.x = 12;
  p.connections[0].bidir = true;
  assert.equal(serializeDSL(p), 'block ui    "UI"   at 12,3 size 9x3 color=#6366F1\nui --> ui\n');
});

test('serializeDSL: parser が黙って捨てる記法は往復で差分になる', () => {
  const cases = [
    'block a "A" at 1,1 size 2x2 shape=cylinder',   // 未知の属性
    'a -> b lpos=middle',                              // 不正な lpos は right に丸められる
    'block a "A" at 01,1 size 2x2',                    // 数値の正規化
    'a -> b width=1.50',
    '@canvas width=400 bg=#fff',
  ];
  for (const text of cases) {
    assert.notEqual(serializeDSL(parseDSL(text)), text, text);
  }
});

test('serializeDSL: core の parseDSL 以外の結果は拒否する', () => {
  assert.throws(() => serializeDSL(strip(parseDSL('a -> b'))), /parsed\.source/);
});

test('parseDSL: @canvas 行の route=(図全体の既定の線の形)を canvas.route に読む。書いていなければ持たない', () => {
  assert.equal(parseDSL('@canvas width=400 route=straight\n').canvas.route, 'straight');
  assert.equal(parseDSL('@canvas width=400\n').canvas.route, undefined);
  const p = parseDSL('@canvas width=400 grid=20 route=ortho\n');
  p.canvas.route = 'straight';
  assert.equal(serializeDSL(p), '@canvas width=400 grid=20 route=straight\n');
});
