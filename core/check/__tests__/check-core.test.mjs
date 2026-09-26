import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainLine, findOverlaps, findOutside, segmentHitsRect, findCrossings, findStraddles, checkDiagram, resolveIncludePath, expandIncludes, checkIncluded, includeDrops, includeOrigin, includedItemNote } from '../check-core.mjs';
import { parseDSL } from '../../dsl/dsl-core.mjs';
import { connectionPaths, computePorts, pathPoints } from '../../label/label-core.mjs';

const check = (text, mode = 'curved') => {
  const p = parseDSL(text);
  return checkDiagram(p, text.split('\n'), connectionPaths(p, mode));
};

test('explainLine: キーワードの書き間違いを言い当てる', () => {
  assert.match(explainLine('blok b "B" at 8,1 size 4x2'), /「blok」.*block の書き間違い/);
  assert.match(explainLine('gruop g "G" at 1,1 size 4x2'), /group の書き間違い/);
  assert.match(explainLine('@canvs width=100'), /@canvas の書き間違い/);
});

test('explainLine: block の欠けた部分を言う', () => {
  assert.match(explainLine('block a "A" at 1,1'), /size WxH/);
  assert.match(explainLine('block a "A" at 1,1'), /書式: block ID "ラベル" at X,Y size WxH/);
  assert.match(explainLine('block a A at 1,1 size 8x3'), /"ラベル"/);
  assert.match(explainLine('block a "A" at 1、1 size 8x3'), /at X,Y/);
  assert.match(explainLine('block a "A" at 1,1 size 8X3'), /size WxH/);
  assert.match(explainLine('Block a "A" at 1,1 size 8x3'), /小文字で block/);
});

test('explainLine: 接続の書き方', () => {
  assert.match(explainLine('a->b'), /前後に空白/);
  assert.match(explainLine('a <- b'), /逆向き/);
  assert.match(explainLine('a => b'), /->/);
  assert.match(explainLine('hello'), /書式にない行/);
});

test('checkDiagram: parser が読めない行に理由を付ける(ID の重複はそのまま)', () => {
  const text = '@canvas width=400 height=300 grid=20\nblock a "A" at 1,1 size 4x2\nblok b "B" at 8,1 size 4x2\nblock a "A2" at 1,5 size 4x2\n';
  const d = check(text);
  assert.deepEqual(d.map(x => [x.line, x.level]), [[3, 'error'], [4, 'error']]);
  assert.match(d[0].msg, /block の書き間違い/);
  assert.match(d[1].msg, /ID "a" が重複/);
});

test('checkDiagram: 存在しない ID への接続はエラー、group への接続は描かれない旨の警告', () => {
  const text = 'block a "A" at 1,1 size 4x2\ngroup g "G" at 1,5 size 8x4\na -> zz\na -> g\nyy -> xx\n';
  const d = check(text);
  assert.equal(d.length, 3);
  assert.deepEqual(d.map(x => [x.line, x.level]), [[3, 'error'], [5, 'error'], [4, 'warn']]);
  assert.match(d[0].msg, /「zz」という ID/);
  assert.match(d[1].msg, /「yy」と「xx」/);
  assert.match(d[2].msg, /group への接続は描かれない/);
});

test('checkDiagram: 同じ組の接続 2 本目を警告', () => {
  const d = check('block a "A" at 1,1 size 4x2\nblock b "B" at 8,1 size 4x2\na -> b\nb -> a "rev"\n');
  assert.equal(d.length, 1);
  assert.equal(d[0].line, 4);
  assert.match(d[0].msg, /L3 と同じ組の 2 本目/);
});

test('findOverlaps / checkDiagram: 同じ座標・一部が重なる block を警告、接するだけは数えない', () => {
  const blocks = [
    { id: 'a', x: 1, y: 1, w: 4, h: 2, line: 1 }, { id: 'b', x: 1, y: 1, w: 4, h: 2, line: 2 },
    { id: 'c', x: 5, y: 1, w: 4, h: 2, line: 3 }, { id: 'd', x: 8, y: 2, w: 4, h: 2, line: 4 },
  ];
  assert.deepEqual(findOverlaps(blocks).map(o => [o.a.id, o.b.id]), [['a', 'b'], ['c', 'd']]);
  const d = check('block a "A" at 1,1 size 4x2\nblock b "B" at 1,1 size 4x2\n');
  assert.equal(d.length, 1);
  assert.equal(d[0].line, 2);
  assert.match(d[0].msg, /block「b」が block「a」\(L1\)に重なっている/);
});

test('segmentHitsRect: 内部を通る線分だけ', () => {
  const r = { x: 10, y: 10, w: 10, h: 10 };
  assert.equal(segmentHitsRect({ x: 0, y: 15 }, { x: 30, y: 15 }, r), true);
  assert.equal(segmentHitsRect({ x: 0, y: 5 }, { x: 30, y: 5 }, r), false);
  assert.equal(segmentHitsRect({ x: 12, y: 12 }, { x: 13, y: 13 }, r), true);   // 内側だけの短い線分
  assert.equal(segmentHitsRect({ x: 0, y: 0 }, { x: 9, y: 9 }, r), false);
});

test('findCrossings: 両端以外の block の上を通る接続を見つける(直線)', () => {
  // a(1,1) → c(1,9) の真ん中に b(1,5) がある
  const text = 'block a "A" at 1,1 size 4x2\nblock b "B" at 1,5 size 4x2\nblock c "C" at 1,9 size 4x2\na -> c\n';
  const d = check(text, 'straight');
  assert.equal(d.length, 1);
  assert.equal(d[0].line, 4);
  assert.match(d[0].msg, /接続「a -> c」の線が block「b」\(L2\)の上を横切る/);
  // 横にずらせば横切らない
  assert.deepEqual(check(text.replace('at 1,5', 'at 8,5'), 'straight'), []);
});

test('findCrossings: owner 批評の 2 列 4 段・3 本で、既定(曲線)の経路が別の block を横切るのを見つける', () => {
  const rows = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) rows.push(`block b${r * 2 + c + 1} "B" at ${1 + c * 12},${1 + r * 5} size 8x3`);
  const text = rows.join('\n') + '\nb1 -> b7\nb2 -> b3\nb4 -> b5\n';
  const d = check(text);
  assert.ok(d.some(x => /「b1 -> b7」の線が block「b3」/.test(x.msg)), JSON.stringify(d));
  assert.ok(d.every(x => x.level === 'warn'));
});

test('findCrossings: 隣り合う block を結ぶだけなら何も言わない', () => {
  const text = 'block a "A" at 1,1 size 8x3\nblock b "B" at 13,1 size 8x3\nblock c "C" at 1,6 size 8x3\na -> b\na -> c\n';
  for (const mode of ['curved', 'straight', 'ortho']) assert.deepEqual(check(text, mode), [], mode);
});

test('computePorts / pathPoints: 1 本の接続は辺の中央から出て中央に入る', () => {
  const m = { a: { x: 1, y: 1, w: 4, h: 2 }, b: { x: 1, y: 6, w: 4, h: 2 } };
  const [p] = computePorts([{ from: 'a', to: 'b' }], m, 20);
  assert.deepEqual(p, { fp: { x: 60, y: 60 }, tp: { x: 60, y: 120 }, fs: 'bottom', ts: 'top' });
  const pts = pathPoints(p.fp, p.tp, p.fs, p.ts, 'curved', 4);
  assert.deepEqual(pts[0], p.fp);
  assert.deepEqual(pts[pts.length - 1], p.tp);
  assert.equal(pts.length, 5);
});

test('checkDiagram: lines が無ければ parser のメッセージから理由を作る', () => {
  const p = parseDSL('blok b "B" at 8,1 size 4x2\n');
  const d = checkDiagram(p, null, null);
  assert.match(d[0].msg, /block の書き間違い/);
});

test('check-cli: @include 先の block を横切る線を、図を開かずに include 元の行で示す', async () => {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { checkFile } = await import('../check-cli.mjs');
  const dir = join(process.cwd(), 'test-results', 'check-cli');
  mkdirSync(join(dir, 'shared'), { recursive: true });
  writeFileSync(join(dir, 'shared', 'common.sb'), 'block rte "RTE" at 1,5 size 4x2\n');
  writeFileSync(join(dir, 'a.sb'), '@canvas width=400 height=300 grid=20\n@include "shared/common.sb"\nblock x "X" at 1,1 size 4x2\nblock y "Y" at 1,9 size 4x2\nx -> y\n');
  const d = checkFile(join(dir, 'a.sb'), 'straight');
  assert.equal(d.length, 1);
  assert.equal(d[0].level, 'warn');
  assert.match(d[0].msg, /「x -> y」の線が block「rte」/);
  assert.ok(d[0].file.endsWith('a.sb'));
  assert.equal(d[0].line, 5);
  // 共通部の RTE を線の脇へ動かせば消える
  writeFileSync(join(dir, 'shared', 'common.sb'), 'block rte "RTE" at 8,5 size 4x2\n');
  assert.deepEqual(checkFile(join(dir, 'a.sb'), 'straight'), []);
});

test('checkDiagram: 読めない接続ラベルを、何に掛かるかと直し方付きで warn に出す', async () => {
  const { placeLabels, labelIssues } = await import('../../label/label-core.mjs');
  const text = '@canvas width=400 height=300 grid=20\nblock a "A" at 1,1 size 4x2\nblock b "B" at 1,8 size 4x2\nnote n "memo" at 0,4 size 3x3\na -> b "hidden" lpos=center\n';
  const p = parseDSL(text);
  const paths = connectionPaths(p, 'straight');
  const d = checkDiagram(p, text.split('\n'), paths, labelIssues(placeLabels(paths, p), p));
  assert.deepEqual(d.map(x => [x.line, x.level]), [[5, 'warn']]);
  assert.match(d[0].msg, /接続「a -> b」のラベル「hidden」が note「n」\(L4\)の下に隠れる/);
  assert.match(d[0].msg, /lpos=/);
  // lpos= を消せば(既定の置き場所)note を避ける
  const t2 = text.replace(' lpos=center', '');
  const p2 = parseDSL(t2);
  const paths2 = connectionPaths(p2, 'straight');
  assert.deepEqual(checkDiagram(p2, t2.split('\n'), paths2, labelIssues(placeLabels(paths2, p2), p2)), []);
});

test('resolveIncludePath: include 元のファイルからの相対パスを / 区切りで解決する', () => {
  assert.equal(resolveIncludePath('05-include.sb', 'shared/common.sb'), 'shared/common.sb');
  assert.equal(resolveIncludePath('corpus/05-include.sb', './shared/common.sb'), 'corpus/shared/common.sb');
  assert.equal(resolveIncludePath('E:/d/corpus/a.sb', '../shared/x.sb'), 'E:/d/shared/x.sb');
  assert.equal(resolveIncludePath('corpus/shared/common.sb', '../a.sb'), 'corpus/a.sb');
  assert.equal(resolveIncludePath('', 'a.sb'), 'a.sb');
  assert.equal(resolveIncludePath('a/b.sb', '/abs/x.sb'), '/abs/x.sb');
});

const MAIN = '@canvas width=480 height=200 grid=20\nblock ui "UI" at 1,1 size 5x3\nui -> shared_db "lookup"\n@include "shared/common.sb"\n';
const COMMON = 'block shared_db "Shared DB" at 19,1 size 5x3\n';

test('expandIncludes: 読めた include 先は展開し、各行の元の場所(ファイル・行・本文の何行目から)を持つ', () => {
  const exp = expandIncludes(MAIN, p => (p === 'shared/common.sb' ? COMMON : null), '05-include.sb');
  assert.equal(exp.missing.length, 0);
  assert.equal(exp.lines[3], 'block shared_db "Shared DB" at 19,1 size 5x3');
  assert.deepEqual(exp.origin[3], { file: 'shared/common.sb', line: 1, at: 4 });
  assert.deepEqual(exp.origin[1], { file: '05-include.sb', line: 2, at: 2 });
  const p = parseDSL(exp.text);
  assert.ok(p.blockMap.shared_db);
  assert.deepEqual(checkIncluded(p, exp, connectionPaths(p)), []);
  // include の無い本文はそのまま
  const plain = 'block a "A" at 1,1 size 2x2\r\n';
  assert.equal(expandIncludes(plain, () => null, 'x.sb').text, plain);
});

test('checkIncluded: 読めない @include はその行のエラーにし、ID が無い接続に原因の include 行を示す', () => {
  const exp = expandIncludes(MAIN, () => null, '05-include.sb');
  assert.deepEqual(exp.missing.map(m => [m.at, m.path]), [[4, 'shared/common.sb']]);
  const p = parseDSL(exp.text);
  const d = checkIncluded(p, exp, connectionPaths(p), { hint: '(「.sb 読込」で本体と一緒に選ぶ)' });
  assert.deepEqual(d.map(x => [x.line, x.level]), [[3, 'error'], [4, 'error']]);
  assert.equal(d[1].msg, 'include 先「shared/common.sb」を読めない(「.sb 読込」で本体と一緒に選ぶ)');
  assert.match(d[0].msg, /「shared_db」という ID の block \/ note が無い\(読めていない include 先: L4「shared\/common.sb」\)$/);
  assert.deepEqual(includeDrops(exp), ['include 先「shared/common.sb」(L4)を読めず、その中の要素は入っていない']);
});

test('checkIncluded: include 先の行の診断は @include 行に寄せ、どのファイルの何行目かを書き添える。循環は読めない扱い', () => {
  const files = { 'shared/common.sb': 'block rte "RTE" at 1,5 size 4x2\nblock rte2 "R2" at 1,5 size 4x2\n', 'self.sb': '@include "self.sb"\n' };
  const text = '@include "shared/common.sb"\nblock x "X" at 1,1 size 4x2\n@include "self.sb"\n';
  const exp = expandIncludes(text, p => files[p] ?? null, 'a.sb');
  const p = parseDSL(exp.text);
  const d = checkIncluded(p, exp, connectionPaths(p));
  const ov = d.find(x => /重なっている/.test(x.msg));
  assert.equal(ov.line, 1);
  assert.equal(ov.msg, 'block「rte2」が block「rte」(shared/common.sb L1)に重なっている(shared/common.sb L2)');
  assert.deepEqual([ov.file, ov.fileLine], ['shared/common.sb', 2]);
  const cyc = d.find(x => /自分自身/.test(x.msg));
  assert.equal(cyc.line, 3);
  assert.match(cyc.msg, /include 先「self.sb」を読めない\(自分自身を include している\)\(self.sb L1\)/);
});

test('check-cli: 読めない @include は include 元のファイルの行でエラーにする', async () => {
  const { mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { checkFile } = await import('../check-cli.mjs');
  const dir = join(process.cwd(), 'test-results', 'check-cli-missing');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'main.sb'), MAIN);
  const d = checkFile(join(dir, 'main.sb'));
  assert.deepEqual(d.map(x => [x.line, x.level]), [[3, 'error'], [4, 'error']]);
  assert.match(d[1].msg, /include 先「shared\/common.sb」を読めない\(ファイルが無い\)/);
  assert.ok(d[1].file.endsWith('main.sb'));
  mkdirSync(join(dir, 'shared'), { recursive: true });
  writeFileSync(join(dir, 'shared', 'common.sb'), COMMON);
  assert.deepEqual(checkFile(join(dir, 'main.sb')), []);
});

test('check-cli --refs / --rename: 図を開かずに参照元を探し、@include 先を含めて全図を 1 操作で改名する', async () => {
  const { mkdirSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { findRefs, renameAcross } = await import('../check-cli.mjs');
  const root = join(process.cwd(), 'test-results', 'check-cli-rename');
  rmSync(root, { recursive: true, force: true });
  const dir = join(root, 'diagrams');
  mkdirSync(join(root, 'shared'), { recursive: true });
  mkdirSync(dir, { recursive: true });
  const common = '﻿# 共通部\r\nblock SpiDrv "SPI" at 1,1 size 4x2\r\nblock os "OS" at 1,5 size 4x2\r\n';
  writeFileSync(join(root, 'shared', 'common.sb'), common);                       // フォルダの外の include 先
  const swc = '@include "../shared/common.sb"\r\nblock app "App" at 8,1 size 4x2 color=#3B82F6\r\napp -> SpiDrv "SpiDrv を呼ぶ"\r\nSpiDrv -> os\r\n';
  writeFileSync(join(dir, 'spi_swc.sb'), swc);
  writeFileSync(join(dir, 'can_swc.sb'), 'block can "Can" at 1,1 size 4x2\n');

  const refs = findRefs([dir], 'SpiDrv');
  assert.deepEqual(refs.map(r => [r.file.endsWith('common.sb') ? 'common' : 'swc', r.line, r.kind]),
    [['swc', 3, 'ref'], ['swc', 4, 'ref'], ['common', 2, 'def']]);

  const dry = renameAcross([dir], 'SpiDrv', 'Spi_Driver', true);
  assert.equal(dry.changes.length, 2);
  assert.equal(readFileSync(join(dir, 'spi_swc.sb'), 'utf8'), swc);                // --dry-run は書かない

  const plan = renameAcross([dir], 'SpiDrv', 'Spi_Driver');
  assert.equal(plan.error, undefined);
  assert.equal(readFileSync(join(root, 'shared', 'common.sb'), 'utf8'), common.replace('block SpiDrv', 'block Spi_Driver'));
  assert.equal(readFileSync(join(dir, 'spi_swc.sb'), 'utf8'),
    '@include "../shared/common.sb"\r\nblock app "App" at 8,1 size 4x2 color=#3B82F6\r\napp -> Spi_Driver "SpiDrv を呼ぶ"\r\nSpi_Driver -> os\r\n');
  assert.deepEqual(findRefs([dir], 'SpiDrv'), []);
  // 既にある ID への改名は、どの図も書き換えない
  assert.match(renameAcross([dir], 'os', 'Spi_Driver').error, /既に定義されている/);
  assert.equal(readFileSync(join(root, 'shared', 'common.sb'), 'utf8'), common.replace('block SpiDrv', 'block Spi_Driver'));
});

test('findStraddles / checkDiagram: group の枠をまたぐ block・group を警告、内側・外側・入れ子は数えない', () => {
  const text = [
    'group ECU "ECU" at 1,1 size 20x10',
    'group MCU "MCU" at 2,3 size 24x6',
    'block CPU "CPU" at 3,5 size 6x3',
    'block EEP "EEP" at 19,2 size 6x3',
    'block out "out" at 30,1 size 6x3',
    'group in "in" at 3,4 size 8x5',
  ].join('\n');
  const p = parseDSL(text);
  const got = findStraddles(p.blocks, p.groups).map(({ item, group }) => `${item.id}/${group.id}`).sort();
  // MCU は ECU の右端を越える(1 回だけ数える)。EEP は ECU と MCU の枠をまたぐ。CPU・in は内側、out は外側
  assert.deepEqual(got, ['EEP/ECU', 'EEP/MCU', 'MCU/ECU']);
  const warns = check(text).filter(d => /枠をまたいでいる/.test(d.msg));
  assert.deepEqual(warns.map(d => d.line), [2, 4, 4]);
  assert.match(warns[0].msg, /group「MCU」が group「ECU」\(L1\)の枠をまたいでいる/);
  assert.match(warns[1].msg, /^block「EEP」/);
  // 収まっていれば何も言わない
  assert.deepEqual(check('group g "G" at 1,1 size 20x10\nblock a "A" at 2,3 size 6x3\n').filter(d => /枠/.test(d.msg)), []);
});

test('findOutside / checkDiagram: キャンバスの外にはみ出す要素を、はみ出す向きとグリッド数とともに警告する', () => {
  const text = '@canvas width=400 height=200 grid=20 grow=off\ngroup g "G" at 0,0 size 10x5\nblock a "A" at 1,1 size 4x2\nblock b "B" at 18,8 size 4x4\nnote n "N" at 1,9 size 3x2\n';
  const p = parseDSL(text);
  const got = findOutside(p.canvas, [...p.blocks, ...p.groups, ...p.notes]).map(o => `${o.item.id}:${o.right},${o.bottom}`);
  assert.deepEqual(got, ['b:2,2', 'n:0,1']);
  const msgs = check(text).filter(d => /キャンバス/.test(d.msg));
  assert.deepEqual(msgs.map(d => [d.line, d.level]), [[4, 'warn'], [5, 'warn']]);
  assert.match(msgs[0].msg, /block「b」がキャンバス\(400×200\)の外に右へ 2・下へ 2 グリッドはみ出している/);
  assert.match(msgs[1].msg, /note「n」がキャンバス\(400×200\)の外に下へ 1 グリッド/);
});

// 本文の @canvas が正。共有部の @canvas で本文の画布(大きさ・線の形)を上書きしない(BLK-junior-20260926-1105: 広げた画布が
// 共有部の 520 に戻り、PNG / SVG の書き出しで下半分が切れた)
test('expandIncludes: 本文に @canvas があれば include 先の @canvas は展開しない。本文に無ければ include 先のものを使う', () => {
  const common = '@canvas width=960 height=520 grid=20 route=ortho\nblock rte "RTE" at 20,2 size 6x3\n';
  const main = '@canvas width=960 height=780 grid=20\nblock swc "SWC" at 1,1 size 6x3\n@include "shared/common.sb"\n';
  const exp = expandIncludes(main, p => (p === 'shared/common.sb' ? common : null), 'spi_swc.sb');
  const p = parseDSL(exp.text);
  assert.deepEqual([p.canvas.width, p.canvas.height, p.canvas.route], [960, 780, undefined]);
  assert.ok(p.blockMap.rte);
  assert.deepEqual(exp.origin[exp.lines.indexOf('block rte "RTE" at 20,2 size 6x3')], { file: 'shared/common.sb', line: 2, at: 3 });
  const bare = expandIncludes('block swc "SWC" at 1,1 size 6x3\n@include "shared/common.sb"\n', p => (p === 'shared/common.sb' ? common : null), 'b.sb');
  assert.equal(parseDSL(bare.text).canvas.height, 520);
});

test('includedItemNote: include 先の要素には定義の場所と直す先を示し、本文の要素には何も出さない', () => {
  const common = 'block rte "RTE" at 20,2 size 6x3\n';
  const exp = expandIncludes('block swc "SWC" at 1,1 size 6x3\n@include "shared/common.sb"\n', p => (p === 'shared/common.sb' ? common : null), 'spi_swc.sb');
  const p = parseDSL(exp.text);
  const base = f => f.split('/').pop();
  assert.deepEqual(includeOrigin(exp, p.blockMap.rte.line), { file: 'shared/common.sb', line: 1, at: 2 });
  assert.equal(includeOrigin(exp, p.blockMap.swc.line), null);
  assert.equal(includedItemNote(exp, p.blockMap.rte.line, base), 'include 先 common.sb の L1 で定義(本文 L2 の @include)。この図からは動かせない・変えられないので common.sb で直す');
  assert.match(includedItemNote(exp, p.blockMap.rte.line, base, 'en'), /^Defined in the included file common\.sb \(line 1; @include on line 2\)/);
  assert.equal(includedItemNote(exp, p.blockMap.swc.line, base), '');
});
