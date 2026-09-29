import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseDSL, serializeDSL } from '../dsl-core.mjs';
import { parseLpos, hasLpos, unquoteLabel, connTrailingLabel } from '../../label/label-core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(__dirname, '..', '..', '..', 'stableblock.html'), 'utf8');

// stableblock.html の parseDSL をそのまま取り出す(ドリフト検出用)
function htmlParseDSL() {
  const start = HTML.indexOf('function parseDSL(text){');
  assert.ok(start >= 0, 'stableblock.html に parseDSL が見つからない');
  const end = HTML.indexOf('\n}\n', start);
  const src = HTML.slice(start, end + 2);
  return new Function('window', `${src}\nreturn parseDSL;`)({ StableBlockLabel: { parseLpos, hasLpos, unquoteLabel, connTrailingLabel } });
}
const DEFAULT_DSL = HTML.match(/let dsl = `([\s\S]*?)`;/)[1];

const SAMPLES = {
  default: DEFAULT_DSL,
  crlf: '@canvas width=400 height=200 grid=20\r\nblock ui "UI" at 1,1 size 5x3 color=#3B82F6 text=#FFFFFF round=4\r\nblock core "Core" at 10,1 size 5x3\r\nui -> core "request"\r\n',
  canvasRoute: '@canvas width=400 route=ortho grid=20\nblock a "A" at 1,1 size 2x2\nblock b "B" at 6,1 size 2x2\na -> b\n',
  canvasGrow: '@canvas width=1120 height=780 grid=20 grow=off\nblock a "A" at 1,1 size 2x2\n',
  bom: '﻿# 先頭に BOM\n@canvas width=400\ngroup g "G" at 0,0 size 10x10 color=#EEF2FF border=#818CF8\n',
  mixed: '  block a "A\\nB" at 1.5,2 size 4x2 style=dashed border=#000\n\tnote n "メモ" at 0,0 size 3x1\na --> n "l" color=#f00 width=2 route=ortho lpos=top\nb -> c\nゴミ行\nblock a "dup" at 0,0 size 1x1\n@include "x.sb"\n',
  // ラベル中の \" は " を表す(BLK-porter-20260926-0617)。末尾が \ のラベルは閉じ引用符の前の \ として読む
  quoted: 'block id_2a "Block \\"quoted\\" label" at 1,1 size 8x3 color=#6366F1\r\nblock p "C:\\" at 1,5 size 4x2\r\nnote n "say \\"hi\\"\\nok" at 5,5 size 4x2\r\ngroup g "\\"G\\"" at 0,0 size 20x10\r\nid_2a -> p "a \\"b\\"" color=#f00\r\np -> id_2a "x\\\\" lpos=top\r\n',
  // ラベルを属性の後ろ・間に書いた接続(BLK-porter-20260929-2029)。行末コメントの中の引用はラベルではない
  trailing: 'block a "A" at 1,2 size 6x3\nblock b "B" at 12,2 size 6x3\na -> b style=dashed "後ろ"\nb -> a width=2 "間 \\"q\\"" color=#EF4444\na --> b lpos=top # "コメント"\nb -> a color=#f00 "x" # c\n',
  // 原点より左上(座標が負)の配置(BLK-porter-20260930-0509)
  negative: '@canvas width=320 height=200 grid=20\ngroup g "G" at -6,-2 size 8x5\nblock a "A" at -2,1 size 5x3\nblock b "B" at 6,-1.5 size 5x3\nnote n "N" at -4,-3 size 3x1\na -> b\n',
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
    'block a "A" at 01,1 size 2x2',                    // 数値の正規化
    'a -> b width=1.50',
    '@canvas width=400 bg=#fff',
  ];
  for (const text of cases) {
    assert.notEqual(serializeDSL(parseDSL(text)), text, text);
  }
});

test('serializeDSL: 行末の # コメントは block / group / note / 接続 / @canvas とも書いたまま往復する(BLK-owner-20260929-1928-1)', () => {
  const text = [
    '@canvas width=400 grid=20   # 図全体',
    'group g "G" at 0,0 size 30x10 color=#EEF2FF # 電源系',
    '\tblock reg "Regulator" at 14,3 size 8x3   # 3.3V',
    'block psu "PSU" at 1,1 size 5x3 color=#f00 shape=x # 未知の属性の後ろ',
    'note n "メモ" at 0,0 size 3x1 #直後',
    'psu -> reg "x"  # c',
    'psu --> reg # 双方向',
    'reg -> psu style=dashed # 破線 color=#123456 も本文のまま',
    '',
  ].join('\r\n');
  const p = parseDSL(text);
  assert.deepEqual(p.errors, []);
  const back = serializeDSL(p).split('\r\n');
  const want = text.split('\r\n');
  want[3] = 'block psu "PSU" at 1,1 size 5x3 color=#f00 # 未知の属性の後ろ';   // コメントより前の未知の属性はこれまでどおり落ちる
  assert.deepEqual(back, want);
  // コメントのある行の値を変えても、コメントはそのまま残る
  p.blockMap.reg.x = 20;
  p.connections[0].label = 'y';
  const moved = serializeDSL(p).split('\r\n');
  assert.equal(moved[2], '\tblock reg "Regulator" at 20,3 size 8x3   # 3.3V');
  assert.equal(moved[5], 'psu -> reg "y"  # c');
});

test('parseDSL: 行末コメントの読み方は stableblock.html と同じ(ドリフト検出)', () => {
  const text = 'block a "A" at 1,1 size 2x2 # c\ngroup g "G" at 0,0 size 9x9 # g\na -> a "l" # c\na -> a #c\n';
  assert.deepEqual(strip(parseDSL(text)), strip(htmlParseDSL()(text)));
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

test('parseDSL: @canvas 行の grow=off(寸法を固定)を canvas.grow に読み、往復で落とさない', () => {
  assert.equal(parseDSL('@canvas width=400 grow=off\n').canvas.grow, 'off');
  assert.equal(parseDSL('@canvas width=400\n').canvas.grow, undefined);
  const src = '@canvas width=1120 height=780 grid=20 grow=off\n';
  assert.equal(serializeDSL(parseDSL(src)), src);
});

// ─── ラベル中の二重引用符(\")。HTML 版・VSCode 拡張・core が同じ規則で読む ───
test('parseDSL: ラベル中の \\" は " として読み、serializeDSL は \\" に戻してバイト一致で往復する', () => {
  const p = parseDSL(SAMPLES.quoted);
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.blocks.map(b => b.label), ['Block "quoted" label', 'C:\\']);
  assert.equal(p.notes[0].label, 'say "hi"\\nok');
  assert.equal(p.groups[0].label, '"G"');
  assert.deepEqual(p.connections.map(c => [c.label, c.color, c.lpos]), [['a "b"', '#f00', 'right'], ['x\\\\', '#64748B', 'top']]);
  assert.equal(serializeDSL(p), SAMPLES.quoted);
  p.blockMap.id_2a.label = 'say "yes"';
  assert.equal(serializeDSL(p).split('\r\n')[0], 'block id_2a "say \\"yes\\"" at 1,1 size 8x3 color=#6366F1');
});

// VSCode 拡張の Webview のパーサ(getWebviewContent が埋め込む parseDSL)も core と同じ結果を返す
function vscodeParseDSL() {
  const src = readFileSync(join(__dirname, '..', '..', '..', 'vscode-stableblock', 'src', 'extension.js'), 'utf8');
  const fakeRequire = m => (m === 'vscode' ? {} : m === 'fs' || m === 'node:fs' ? require_('fs') : m === 'path' || m === 'node:path' ? require_('path') : require_(m));
  const mod = { exports: {} };
  const fns = new Function('require', 'module', 'exports', '__dirname', `${src}\nreturn { getWebviewContent };`)(fakeRequire, mod, mod.exports, join(__dirname, '..', '..', '..', 'vscode-stableblock', 'src'));
  const html = fns.getWebviewContent('@canvas width=400\n', null);
  const start = html.indexOf('function parseDSL(t){\n  var ls=t.split("\\n"),cv={width:960,height:640,grid:20},bl=[],gr=[],nt=[]');
  assert.ok(start >= 0, 'Webview に parseDSL が見つからない');
  const end = html.indexOf('\n}\n', start);
  return new Function('window', `${html.slice(start, end + 2)}\nreturn parseDSL;`)({ StableBlockLabel: { parseLpos, hasLpos, unquoteLabel, connTrailingLabel } });
}
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);

test('VSCode 拡張の Webview の parseDSL もラベル中の \\" を core と同じに読む', () => {
  const vs = vscodeParseDSL();
  const text = SAMPLES.quoted.replace(/\r\n/g, '\n');
  const a = parseDSL(text), b = vs(text);
  assert.deepEqual(b.errors, []);
  for (const k of ['blocks', 'groups', 'notes']) assert.deepEqual(b[k].map(x => [x.id, x.label]), a[k].map(x => [x.id, x.label]), k);
  assert.deepEqual(b.connections.map(c => [c.from, c.to, c.label]), a.connections.map(c => [c.from, c.to, c.label]));
});

test('parseDSL: 重複した@canvasは最後の値を有効にし、先行行を警告して原文のまま往復する', () => {
  const text = '@canvas width=480 height=240 grid=20\n@canvas width=800 height=600 grid=40\nblock a "A" at 2,1 size 6x3\n';
  const p = parseDSL(text);
  assert.deepEqual(p.canvas, { width: 800, height: 600, grid: 40 });
  assert.equal(serializeDSL(p), text);
  assert.deepEqual(p.warnings, [{ line: 1, msg: '@canvas が 2 行ある。L2 の値が効く' }]);
});

test('parseDSL: 取れない style / route / grow / lpos の値はその行で警告し、本文はそのまま往復する(BLK-porter-20260929-0530)', () => {
  const text = [
    '@canvas width=480 height=240 grid=20 route=zigzag grow=maybe',
    'block a "A" at 1,1 size 6x3',
    'block b "未対応" at 1,1 size 8x3 color=#EF4444 text=#FFFFFF style=dotted',
    'note n "N" at 1,6 size 4x2 style=double',
    'a -> b "style=dotted in label" style=bold route=spline lpos=middle',
  ].join('\n');
  const p = parseDSL(text);
  // lpos も描く位置だけ既定(right)に倒し、本文の値は書いたまま往復する(BLK-porter-20260929-0511)
  assert.equal(serializeDSL(p), text);
  assert.equal(p.connections[0].lpos, 'right');
  assert.equal(p.blockMap.b.style, 'dotted');   // 値は読んだまま(描画は既定の実線)
  assert.deepEqual(p.warnings, [
    { line: 1, msg: 'route=zigzag は使えない。route を書いていない接続を曲線で描く(使える値: curved / straight / ortho)' },
    { line: 1, msg: 'grow=maybe は使えない。on と同じく操作ではみ出したら広げる(使える値: on / off)' },
    { line: 3, msg: 'style=dotted は使えない。実線で描く(使える値: solid / dashed / bold)' },
    { line: 4, msg: 'style=double は使えない。実線で描く(使える値: solid / dashed / bold)' },
    { line: 5, msg: 'style=bold は使えない。実線で描く(使える値: solid / dashed)' },
    { line: 5, msg: 'route=spline は使えない。曲線で描く(使える値: curved / straight / ortho)' },
    { line: 5, msg: 'lpos=middle は使えない。ラベルを線の右に置く(使える値: right / left / top / bottom / center)' },
  ]);
});

test('parseDSL: 取れる値だけなら値の警告は 0 件。@canvas の 2 行目で値の警告は消えない', () => {
  const ok = [
    '@canvas route=ortho grow=off',
    'block a "A" at 1,1 size 6x3 style=bold',
    'block b "B" at 9,1 size 6x3 style=dashed',
    'note n "N" at 1,6 size 4x2 style=solid',
    'a -> b style=dashed route=straight lpos=center',
    'b -> a style=solid route=curved lpos=top',
  ].join('\n');
  assert.deepEqual(parseDSL(ok).warnings, []);
  const two = 'block a "A" at 1,1 size 6x3 style=dotted\n@canvas width=480\n@canvas width=500\n';
  assert.deepEqual(parseDSL(two).warnings.map(w => w.line), [1, 2]);
});

test('serializeDSL: 取れない値(lpos / round / width / @canvas の数)は警告し、値を変えない限り本文のまま書き戻す(BLK-porter-20260929-0511)', () => {
  const text = [
    '@canvas width=wide height=300px grid=20',
    'block a "A" at 1,1 size 6x3 round=abc',
    'note n "N" at 1,6 size 4x2 round=8px',
    'a -> b "斜め置き" lpos=diagonal width=thick',
    'b -> a width=1.2.3 lpos=top',
  ].join('\r\n');
  const p = parseDSL(text);
  assert.equal(serializeDSL(p), text);
  // 描く値は今までどおり(既定、または先頭の数字)
  assert.deepEqual(p.canvas, { width: 960, height: 300, grid: 20 });
  assert.deepEqual([p.blocks[0].round, p.notes[0].round], [4, 8]);
  assert.deepEqual(p.connections.map(c => [c.lpos, c.width]), [['right', 1.5], ['top', NaN]]);
  assert.deepEqual(p.warnings.map(w => [w.line, w.msg.split('。')[0]]), [
    [1, 'width=wide は使えない'], [1, 'height=300px は使えない'], [2, 'round=abc は使えない'], [3, 'round=8px は使えない'],
    [4, 'lpos=diagonal は使えない'], [4, 'width=thick は使えない'], [5, 'width=1.2.3 は使えない'],
  ]);
  // 値を変えたところだけ新しい値になる
  p.connections[0].lpos = 'top';
  p.blocks[0].round = 6;
  assert.deepEqual(serializeDSL(p).split('\r\n'), [
    '@canvas width=wide height=300px grid=20',
    'block a "A" at 1,1 size 6x3 round=6',
    'note n "N" at 1,6 size 4x2 round=8px',
    'a -> b "斜め置き" lpos=top width=thick',
    'b -> a width=1.2.3 lpos=top',
  ]);
});

test('parseDSL / serializeDSL: 属性の後ろ・間に書いた接続のラベルを読み、書いた場所のまま往復する(BLK-porter-20260929-2029)', () => {
  const text = [
    '@canvas grid=10 width=500 height=240',
    'block x "X" at 2,2 size 6x3', 'block y "Y" at 12,2 size 6x3', 'block z "Z" at 22,2 size 6x3',
    'x -> y width=2 style=dashed color=#EF4444 "先"',
    'y -> z "後" color=#10B981 width=3',
    'z -> x route=ortho lpos=bottom "戻り"',
    'x --> z style=dashed "a b" lpos=top  # 注 "c"',
  ].join('\n') + '\n';
  const p = parseDSL(text);
  assert.deepEqual(p.connections.map(c => [c.label, c.style, c.color, c.width, c.route, c.lpos, c.lposAuto]), [
    ['先', 'dashed', '#EF4444', 2, null, 'right', true],
    ['後', 'solid', '#10B981', 3, null, 'right', true],
    ['戻り', 'solid', '#64748B', 1.5, 'ortho', 'bottom', false],
    ['a b', 'dashed', '#64748B', 1.5, null, 'top', false],
  ]);
  assert.equal(serializeDSL(p), text);   // ラベルが落ちず、並びも変わらない
  // 値を変えるとその場所で変わる
  p.connections[0].label = '先2'; p.connections[0].color = '#000000'; p.connections[3].label = 'c"d';
  const out = serializeDSL(p).split('\n');
  assert.equal(out[4], 'x -> y width=2 style=dashed color=#000000 "先2"');
  assert.equal(out[7], 'x --> z style=dashed "c\\"d" lpos=top  # 注 "c"');
  // 行末コメントの中の引用はラベルにしない
  assert.equal(parseDSL('a -> b lpos=top # "memo"\n').connections[0].label, '');
});
