import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainLine, findOverlaps, segmentHitsRect, findCrossings, checkDiagram } from '../check-core.mjs';
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
