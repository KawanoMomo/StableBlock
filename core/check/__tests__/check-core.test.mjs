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

// BLK-porter-20260926-2105: @canvas が 2 行あっても黙らない。効かない前の行に、どの行の値が効くかを出す
test('checkDiagram: @canvas が 2 行あれば前の行に警告(最後の行の値が効く)', () => {
  const d = check('@canvas width=480 height=240 grid=20\n@canvas width=800 height=600 grid=40\nblock a "A" at 2,1 size 6x3\n');
  assert.deepEqual(d.map(x => [x.line, x.level, x.msg]), [[1, 'warn', '@canvas が 2 行ある。L2 の値が効く']]);
  const three = check('@canvas width=480\n# memo\n@canvas width=600\n@canvas width=800 height=600\nblock a "A" at 2,1 size 6x3\n');
  assert.deepEqual(three.map(x => [x.line, x.msg]), [[1, '@canvas が 3 行ある。L4 の値が効く'], [3, '@canvas が 3 行ある。L4 の値が効く']]);
  assert.deepEqual(check('@canvas width=800 height=600\nblock a "A" at 2,1 size 6x3\n'), []);
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

// 行きと戻り(a -> b と b -> a)は別の線なので警告しない。同じ向き・双方向と重なる向きの 2 本目を警告(BLK-owner-20260928-2255-2 で「向きを問わず同じ組」から変えた)
test('checkDiagram: 同じ向きの接続 2 本目を警告し、逆向きの接続は警告しない', () => {
  const AB = 'block a "A" at 1,1 size 4x2\nblock b "B" at 8,1 size 4x2\n';
  assert.deepEqual(check(AB + 'a -> b "req"\nb -> a "notify"\n'), []);
  const d = check(AB + 'a -> b\na -> b "dup"\n');
  assert.equal(d.length, 1);
  assert.equal(d[0].line, 4);
  assert.match(d[0].msg, /L3 と同じ向きの 2 本目/);
  const bi = check(AB + 'a --> b\nb -> a\n');
  assert.equal(bi.length, 1);
  assert.equal(bi[0].line, 4);
  assert.match(check(AB + 'b -> a\na --> b\n')[0].msg, /L3 と同じ向きの 2 本目/);
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

test('findCrossings: note が端の接続(注釈線)も、block 同士の線と同じに横切りを数える', () => {
  // note n(1,1) → block c(1,9) の真ん中に b(1,5) がある
  const text = 'note n "N" at 1,1 size 4x2\nblock b "B" at 1,5 size 4x2\nblock c "C" at 1,9 size 4x2\nn -> c "trigger"\n';
  for (const mode of ['curved', 'straight', 'ortho']) {
    const d = check(text, mode);
    assert.equal(d.length, 1, mode + JSON.stringify(d));
    assert.equal(d[0].line, 4);
    assert.match(d[0].msg, /接続「n -> c」の線が block「b」\(L2\)の上を横切る/);
    assert.deepEqual(check(text.replace('at 1,5', 'at 8,5'), mode), [], mode);
  }
  // block → note の向きも同じ
  assert.match(check(text.replace('n -> c', 'c -> n'), 'straight')[0].msg, /接続「c -> n」の線が block「b」/);
});

test('findCrossings: owner 批評の DFD で、note Cycle_10ms -> Adc_Drv の線が Tester と Sensor の上を横切ると言う', () => {
  const text = [
    '@canvas width=960 height=520 grid=20',
    'block Adc_Drv "Adc_Drv" at 11,3 size 8x3',
    'block Sensor "Sensor" at 22,1 size 8x3',
    'block Tester "Tester" at 31,1 size 8x3',
    'note Cycle_10ms "Cycle_10ms" at 40,1 size 8x2',
    'Cycle_10ms -> Adc_Drv "trigger"',
  ].join('\n') + '\n';
  const d = check(text).filter(x => x.line === 6).map(x => x.msg);
  assert.ok(d.some(m => /接続「Cycle_10ms -> Adc_Drv」の線が block「Tester」\(L4\)の上を横切る/.test(m)), JSON.stringify(d));
  assert.ok(d.some(m => /接続「Cycle_10ms -> Adc_Drv」の線が block「Sensor」\(L3\)の上を横切る/.test(m)), JSON.stringify(d));
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

// プロパティ欄の出し分け(BLK-owner-20260927-0728-5): include 先の要素は値を見せる行だけ、本文の要素は null(打てる欄を出す)
import { includedItemRows } from '../check-core.mjs';
test('includedItemRows: include 先の要素は値を見せるだけの行、本文の要素は null(打てる欄)', () => {
  const common = 'block rte "RTE" at 20,2 size 6x3 color=#3B82F6 text=#FFFFFF\ngroup os_grp "OS" at 18,0 size 12x8 color=#F1F5F9 border=#94A3B8\nnote memo "a\\nb" at 1,9 size 8x2\n';
  const exp = expandIncludes('block swc "SWC" at 1,1 size 6x3\n@include "shared/common.sb"\n', p => (p === 'shared/common.sb' ? common : null), 'spi_swc.sb');
  const p = parseDSL(exp.text);
  assert.equal(includedItemRows(exp, p.blockMap.swc), null);
  assert.equal(includedItemRows(exp, null), null);
  const rows = includedItemRows(exp, p.blockMap.rte);
  assert.deepEqual(rows.map(r => r.key), ['label', 'id', 'pos', 'size', 'color', 'text']);
  assert.deepEqual(Object.fromEntries(rows.map(r => [r.key, r.value])), { label: 'RTE', id: 'rte', pos: '20, 2', size: '6 x 3', color: '#3B82F6', text: '#FFFFFF' });
  assert.equal(rows[0].label, 'ラベル');
  const g = includedItemRows(exp, p.groupMap.os_grp);
  assert.deepEqual(g.map(r => r.key), ['label', 'id', 'pos', 'size', 'color', 'border']);
  assert.equal(g.find(r => r.key === 'border').value, '#94A3B8');
  const n = includedItemRows(exp, p.noteMap.memo, 'en');
  assert.equal(n[0].label, 'Text');
  assert.equal(n[0].value, 'a / b');                                   // 本文の \n は 1 行に
});

// 一括書き出し(BLK-primary-20260926-1205): 一緒に読み込んだ図を 1 枚ずつ、表示中の図と同じ探し方で include を解決する
import { loadedReader, expandLoaded, bulkFileName, bulkDrops } from '../check-core.mjs';

test('loadedReader: パスが一致する図、無ければ自分以外で名前が 1 つだけ一致する図を include 先にする', () => {
  const files = { 'spi_swc.sb': 'S', 'common.sb': 'C', 'a/x.sb': 'AX', 'b/x.sb': 'BX' };
  assert.equal(loadedReader(files, 'spi_swc.sb')('shared/common.sb'), 'C');   // 読込で選んだ図は名前だけで持つ
  assert.equal(loadedReader(files, 'spi_swc.sb')('a/x.sb'), 'AX');
  assert.equal(loadedReader(files, 'spi_swc.sb')('x.sb'), null);              // 同じ名前が 2 枚あれば決めない
  assert.equal(loadedReader(files, 'common.sb')('shared/common.sb'), null);  // 自分自身は名前では当てない
});

test('expandLoaded: 読み込んだ全部の図を読込の順に返し、include されるだけの共通部も 1 枚として出す', () => {
  const files = {
    'spi_swc.sb': '@canvas width=400 height=200\n@include "shared/common.sb"\nblock s "S" at 1,1 size 4x2\ns -> rte',
    'can_swc.sb': '@include "shared/common.sb"\nblock c "C" at 1,1 size 4x2',
    'common.sb': 'block rte "RTE" at 8,1 size 4x2',
  };
  const docs = expandLoaded(files);
  assert.deepEqual(docs.map(d => d.path), ['spi_swc.sb', 'can_swc.sb', 'common.sb']);
  const p = parseDSL(docs[0].exp.text);
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.blocks.map(b => b.id), ['rte', 's']);
  assert.deepEqual(docs.map(d => d.exp.missing.length), [0, 0, 0]);
  assert.deepEqual(includeDrops(expandLoaded({ 'a.sb': '@include "gone.sb"' })[0].exp), ['include 先「gone.sb」(L1)を読めず、その中の要素は入っていない']);
});

test('bulkFileName / bulkDrops: zip の中の名前は図のパスの拡張子を差し替え、知らせは図の名前を頭に付けて並べる', () => {
  assert.equal(bulkFileName('spi_swc.sb', 'svg'), 'spi_swc.svg');
  assert.equal(bulkFileName('shared/common.sb', 'xlsx'), 'shared/common.xlsx');
  assert.equal(bulkFileName('notes.txt', 'mmd'), 'notes.mmd');
  assert.deepEqual(bulkDrops([{ path: 'a.sb', dropped: ['x', 'y'] }, { path: 'b.sb', dropped: [] }, { path: 'c.sb', dropped: ['z'] }]),
    ['a.sb: x', 'a.sb: y', 'c.sb: z']);
});

test('bulkFileName: 1 枚の書き出しも .sb 保存と同じ図の名前から付ける(新規の図は diagram、透過 PNG は _transparent を挟む)', () => {
  assert.equal(bulkFileName('critique3-swc.sb', 'svg'), 'critique3-swc.svg');
  assert.equal(bulkFileName('critique3-swc.sb', 'png'), 'critique3-swc.png');
  assert.equal(bulkFileName('critique3-swc.sb', 'png', '_transparent'), 'critique3-swc_transparent.png');
  assert.equal(bulkFileName('critique3-swc.sb', 'xlsx'), 'critique3-swc.xlsx');
  assert.equal(bulkFileName('critique3-swc.sb', 'mmd'), 'critique3-swc.mmd');
  assert.equal(bulkFileName('Adc.Stack.stableblock', 'svg'), 'Adc.Stack.svg');
  assert.equal(bulkFileName('diagram.sb', 'svg'), 'diagram.svg');
  assert.equal(bulkFileName('diagram.sb', 'png', '_transparent'), 'diagram_transparent.png');
});

// 作図 UI から @include を足す・外す(BLK-primary-20260926-1205-friction)
import { includeLines, includeCandidates, addIncludeInDsl, removeIncludeInDsl, relativeIncludePath, loadedKeyOf } from '../check-core.mjs';

test('includeLines / removeIncludeInDsl: 本文の @include 行を行番号で拾い、その行だけを消す', () => {
  const dsl = '# x\n@canvas width=400\n@include "shared/common.sb"\nblock a "A" at 1,1 size 4x2';
  assert.deepEqual(includeLines(dsl), [{ line: 3, path: 'shared/common.sb' }]);
  assert.equal(removeIncludeInDsl(dsl, 3), '# x\n@canvas width=400\nblock a "A" at 1,1 size 4x2');
  assert.equal(removeIncludeInDsl(dsl, 4), dsl);   // @include 行でなければ変えない
});

test('addIncludeInDsl: 最後の @include の後、無ければ @canvas の後、無ければ先頭のコメントの後に 1 行だけ足す(改行コードは本文に合わせる)', () => {
  assert.equal(addIncludeInDsl('# a\n@canvas width=400\nblock a "A" at 1,1 size 4x2', 'c.sb'), '# a\n@canvas width=400\n@include "c.sb"\nblock a "A" at 1,1 size 4x2');
  assert.equal(addIncludeInDsl('@include "x.sb"\n@include "y.sb"\nblock a "A" at 1,1 size 4x2', 'c.sb'), '@include "x.sb"\n@include "y.sb"\n@include "c.sb"\nblock a "A" at 1,1 size 4x2');
  assert.equal(addIncludeInDsl('# a\n# b\nblock a "A" at 1,1 size 4x2', 'c.sb'), '# a\n# b\n@include "c.sb"\nblock a "A" at 1,1 size 4x2');
  assert.equal(addIncludeInDsl('# a\r\n@canvas\r\nblock a "A" at 1,1 size 4x2\r\n', 'c.sb'), '# a\r\n@canvas\r\n@include "c.sb"\r\nblock a "A" at 1,1 size 4x2\r\n');
});

test('relativeIncludePath / loadedKeyOf: 図のフォルダから見た相対パスと、本文のパスが指す読み込んだ図', () => {
  assert.equal(relativeIncludePath('spi/spi_swc.sb', 'shared/common.sb'), '../shared/common.sb');
  assert.equal(relativeIncludePath('spi_swc.sb', 'shared/common.sb'), 'shared/common.sb');
  assert.equal(relativeIncludePath('a/b/x.sb', 'a/c.sb'), '../c.sb');
  assert.equal(loadedKeyOf({ 'spi_swc.sb': '', 'common.sb': '' }, 'spi_swc.sb', 'shared/common.sb'), 'common.sb');
});

test('includeCandidates: 自分・取り込み済み・自分を取り込んでいる図は出さず、同じフォルダの図の書き方をパスに使う', () => {
  const files = {
    'spi_swc.sb': 'block s "S" at 1,1 size 4x2',
    'spi_dataflow.sb': '@include "shared/common.sb"\n@include "spi_swc.sb"',
    'can_swc.sb': '@include "shared/common.sb"',
    'common.sb': 'block rte "RTE" at 8,1 size 4x2',
  };
  // spi_swc: spi_dataflow は自分を取り込んでいるので出ない。common は同じフォルダの図の書き方(shared/common.sb)で、ほかの図が取り込んでいるので先に出る
  assert.deepEqual(includeCandidates(files, 'spi_swc.sb'), [{ file: 'common.sb', path: 'shared/common.sb' }, { file: 'can_swc.sb', path: 'can_swc.sb' }]);
  // can_swc は common を取り込み済み。common を取り込んでいる図は common の候補に出ない(循環)
  assert.deepEqual(includeCandidates(files, 'can_swc.sb').map(c => c.file), ['spi_swc.sb', 'spi_dataflow.sb']);
  assert.deepEqual(includeCandidates(files, 'common.sb').map(c => c.file), ['spi_swc.sb']);
  // 書き方の手本が無ければ相対パス
  assert.deepEqual(includeCandidates({ 'a/x.sb': '', 'lib/c.sb': '' }, 'a/x.sb'), [{ file: 'lib/c.sb', path: '../lib/c.sb' }]);
});

test('includeCandidates: 取り込んでいる図が無くても、自分の接続が指していて自分に無い ID を定義している図を先に出す', () => {
  const files = {
    'spi_swc.sb': 'block SpiDrv "S" at 1,1 size 4x2\nSpiDrv -> rte',
    'can_swc.sb': 'block CanDrv "C" at 1,1 size 4x2\nCanDrv -> rte',
    'common.sb': 'block rte "RTE" at 8,1 size 4x2',
  };
  assert.deepEqual(includeCandidates(files, 'spi_swc.sb').map(c => c.file), ['common.sb', 'can_swc.sb']);
});

import { includersOf, addedDiagnostics, includeImpact } from '../check-core.mjs';
import { placeLabels, labelIssues } from '../../label/label-core.mjs';

// HTML 版のエラー欄・CLI と同じ診断(一緒に読み込んだ図から @include を解決し、経路とラベルも見る)
const checkLoaded = (files, k) => {
  const exp = expandIncludes(files[k], loadedReader(files, k), k);
  const p = parseDSL(exp.text), paths = connectionPaths(p);
  return checkIncluded(p, exp, paths, { labelIssues: labelIssues(placeLabels(paths, p), p) });
};
const IMP_COMMON = '@canvas width=960 height=520 grid=20\nblock rte "RTE" at 20,2 size 8x3\nblock os "OS" at 20,8 size 8x3\nblock hal "HAL" at 20,14 size 8x3\nrte -> os';
const swc = p => `@canvas width=960 height=520 grid=20\n@include "shared/common.sb"\nblock ${p}Drv "${p}Drv" at 4,2 size 8x3\n${p}Drv -> rte`;
const flow = p => `@canvas width=960 height=520 grid=20\n@include "shared/common.sb"\nblock ${p}Drv "${p}Drv" at 4,14 size 8x3\nblock ${p}data "D" at 4,8 size 8x3\n${p}Drv -> ${p}data\n${p}data -> rte`;

test('includersOf: 表示中の図を(include 先をたどって)取り込んでいる、一緒に読み込んだ図', () => {
  const files = { 'a.sb': '@include "mid.sb"', 'mid.sb': '@include "shared/common.sb"', 'b.sb': 'block b "B" at 1,1 size 2x2', 'common.sb': 'block c "C" at 1,1 size 2x2' };
  assert.deepEqual(includersOf(files, 'common.sb'), ['a.sb', 'mid.sb']);
  assert.deepEqual(includersOf(files, 'mid.sb'), ['a.sb']);
  assert.deepEqual(includersOf(files, 'b.sb'), []);
  assert.deepEqual(includersOf(files, 'nope.sb'), []);
});

test('addedDiagnostics: 同じ level・行・文を 1 件ずつ打ち消し、増えた分だけ残す', () => {
  const d = (line, msg, level = 'warn') => ({ line, level, msg });
  assert.deepEqual(addedDiagnostics([d(3, 'x'), d(5, 'y')], [d(3, 'x'), d(5, 'y'), d(6, 'z')]), [d(6, 'z')]);
  assert.deepEqual(addedDiagnostics([d(3, 'x')], [d(3, 'x'), d(3, 'x')]), [d(3, 'x')]);
  assert.deepEqual(addedDiagnostics([d(3, 'x')], [d(4, 'x')]), [d(4, 'x')]);
  assert.deepEqual(addedDiagnostics([d(3, 'x')], []), []);
});

test('includeImpact: 共通部を動かすと、取り込んでいる図のうち線が横切るようになった図と行だけが出る(共通部の中の重なりは数えない)', () => {
  const files = { 'spi_swc.sb': swc('Spi'), 'spi_dataflow.sb': flow('Spi'), 'can_swc.sb': swc('Can'), 'other.sb': 'block o "O" at 1,1 size 2x2', 'common.sb': IMP_COMMON };
  const base = files['common.sb'];
  // 1 列右: 影響なし
  let r = includeImpact({ ...files, 'common.sb': base.replace('at 20,2', 'at 21,2') }, 'common.sb', base, checkLoaded);
  assert.deepEqual(r.includers, ['spi_swc.sb', 'spi_dataflow.sb', 'can_swc.sb']);
  assert.deepEqual(r.added, []);
  // OS の右下へ: 構成図の Drv -> rte が OS を横切る(データフロー図は横切らない)
  r = includeImpact({ ...files, 'common.sb': base.replace('at 20,2', 'at 30,11') }, 'common.sb', base, checkLoaded);
  assert.deepEqual(r.added.map(d => `${d.path}:${d.line}:${d.level}`), ['spi_swc.sb:4:warn', 'can_swc.sb:4:warn']);
  assert.match(r.added[0].msg, /接続「SpiDrv -> rte」の線が block「os」\(shared\/common\.sb L3\)の上を横切る/);
  // OS に重ねる: 共通部の中の重なり(共通部自身の欄に出る)は数えず、横切りだけ
  r = includeImpact({ ...files, 'common.sb': base.replace('at 20,2', 'at 21,8') }, 'common.sb', base, checkLoaded);
  assert.ok(r.added.length > 0 && r.added.every(d => /横切る/.test(d.msg)));
  // 取り込み側に元からあった診断は出ない。編集していなければ何も出ない
  const pre = { ...files, 'spi_swc.sb': swc('Spi') + '\nblock dup "D" at 4,2 size 2x2' };
  assert.deepEqual(includeImpact(pre, 'common.sb', base, checkLoaded).added, []);
  assert.deepEqual(includeImpact({ ...pre, 'common.sb': base.replace('at 20,2', 'at 21,2') }, 'common.sb', base, checkLoaded).added, []);
});

test('includeImpact: 取り込み側の block に重なるようになった共通部の block は、取り込み側の行で出る。cache で編集前を測り直さない', () => {
  const files = { 'spi_swc.sb': swc('Spi'), 'common.sb': IMP_COMMON };
  const base = IMP_COMMON;
  let calls = 0;
  const counted = (f, k) => { calls++; return checkLoaded(f, k); };
  const cache = new Map();
  const moved = { ...files, 'common.sb': base.replace('at 20,2', 'at 6,3') };
  const r = includeImpact(moved, 'common.sb', base, counted, cache);
  assert.deepEqual(r.added.map(d => `${d.path}:${d.line}`), ['spi_swc.sb:3']);
  assert.match(r.added[0].msg, /block「SpiDrv」が block「rte」/);
  assert.equal(calls, 2);
  includeImpact({ ...files, 'common.sb': base.replace('at 20,2', 'at 6,4') }, 'common.sb', base, counted, cache);
  assert.equal(calls, 3);   // 編集前は cache から
});

// ラベルから ID を作れず `__new_` の仮の ID が残った要素を、行番号付きで警告する(BLK-junior-20260926-0950-wish:
// 日本語だけのラベルでは ID が自動で付かず、そのまま保存・レビューに回っていた)
test('checkDiagram: __new_ の仮の ID が残る block / group / note を、ラベル付きで warn に出す', () => {
  const text = '@canvas width=800 height=400 grid=20\ngroup __new_2 "制御部" at 0,0 size 12x6\nblock app "App" at 1,1 size 4x2\nblock __new_1 "通信管理" at 6,1 size 4x2\nnote __new_3 "メモ" at 14,1 size 3x2\n__new_1 -> app\n';
  const d = check(text).filter(x => /仮の ID/.test(x.msg));
  assert.deepEqual(d.map(x => [x.line, x.level]), [[2, 'warn'], [4, 'warn'], [5, 'warn']]);
  assert.match(d[0].msg, /^group「__new_2」\(「制御部」\)はまだ仮の ID/);
  assert.match(d[1].msg, /^block「__new_1」\(「通信管理」\)はまだ仮の ID/);
  assert.match(d[2].msg, /^note「__new_3」/);
  assert.match(d[1].msg, /英数字と _/);
  assert.deepEqual(check('block app "App" at 1,1 size 4x2\nblock new_1 "N" at 6,1 size 4x2\n'), []);
});

// 「.sb 読込 ▾」のフォルダ選択・ドロップと「一括 ▾」の前回の形式(BLK-junior-20260926-1705-wish)
import { sbLoadable, folderSbEntries, pickMainDiagram, bulkFormatOrder, trimCommonDir } from '../check-core.mjs';

test('sbLoadable: フォルダの中は .sb / .stableblock だけ、隠しフォルダの下は読まない。じかに選んだファイルは .txt も', () => {
  assert.equal(sbLoadable('junior/spi_swc.sb', true), true);
  assert.equal(sbLoadable('junior/shared/common.SB', true), true);
  assert.equal(sbLoadable('junior/x.stableblock', true), true);
  assert.equal(sbLoadable('junior/spi_swc.xlsx', true), false);
  assert.equal(sbLoadable('junior/README.txt', true), false);
  assert.equal(sbLoadable('primary/.git/x.sb', true), false);
  assert.equal(sbLoadable('.hidden.sb', true), true);                 // 隠しなのはフォルダだけ見る
  assert.equal(sbLoadable('notes.txt', false), true);
  assert.equal(sbLoadable('a\\.git\\b.sb', true), false);
  assert.equal(sbLoadable('a\\b.sb', true), true);
});

test('folderSbEntries: 読み込める図だけをパスの順に並べる(ほかの項目はそのまま持つ)', () => {
  const got = folderSbEntries([
    { path: 'j/spi_swc.sb', n: 1 }, { path: 'j/spi_swc.png', n: 2 }, { path: 'j/shared/common.sb', n: 3 }, { path: 'j/spi_dataflow.sb', n: 4 },
  ]);
  assert.deepEqual(got.map(d => d.n), [3, 4, 1]);
  assert.deepEqual(folderSbEntries([]), []);
});

test('pickMainDiagram: ほかの図から @include されていない最初の図を本文にする', () => {
  const inc = '@canvas width=100 height=100\n@include "shared/common.sb"\n';
  assert.equal(pickMainDiagram([
    { path: 'j/shared/common.sb', text: 'block os "OS" at 1,1 size 2x2' },
    { path: 'j/spi_dataflow.sb', text: inc },
    { path: 'j/spi_swc.sb', text: inc },
  ]), 1);
  // フォルダの無い名前だけでも当てる(「ファイルを選ぶ」で選んだ図)
  assert.equal(pickMainDiagram([{ path: 'common.sb', text: '' }, { path: 'spi_swc.sb', text: inc }]), 1);
  // 読めなかった図は選ばない、全部が取り込まれていれば読めた最初の図、読めた図が無ければ -1
  assert.equal(pickMainDiagram([{ path: 'a.sb', text: null }, { path: 'b.sb', text: 'x' }]), 1);
  assert.equal(pickMainDiagram([{ path: 'a.sb', text: '@include "b.sb"' }, { path: 'b.sb', text: '@include "a.sb"' }]), 0);
  assert.equal(pickMainDiagram([{ path: 'a.sb', text: null }]), -1);
});

test('bulkFormatOrder: 前回の形式を先頭に、残りは元の順', () => {
  const f = ['svg', 'png', 'png-transparent', 'xlsx', 'mermaid'];
  assert.deepEqual(bulkFormatOrder(f, 'xlsx'), ['xlsx', 'svg', 'png', 'png-transparent', 'mermaid']);
  assert.deepEqual(bulkFormatOrder(f, null), f);
  assert.deepEqual(bulkFormatOrder(f, 'pdf'), f);
});

test('trimCommonDir: 選んだフォルダの名前を外し、フォルダの中のパスにする(相対パスは変わらない)', () => {
  const t = l => trimCommonDir(l.map(path => ({ path, x: 1 }))).map(d => d.path);
  assert.deepEqual(t(['junior/spi_swc.sb', 'junior/shared/common.sb']), ['spi_swc.sb', 'shared/common.sb']);
  assert.deepEqual(t(['a/b/x.sb', 'a/b/c/y.sb']), ['x.sb', 'c/y.sb']);
  assert.deepEqual(t(['a/x.sb', 'b/y.sb']), ['a/x.sb', 'b/y.sb']);
  assert.deepEqual(t(['x.sb', 'junior/y.sb']), ['x.sb', 'junior/y.sb']);
  assert.deepEqual(t([]), []);
  assert.equal(trimCommonDir([{ path: 'j/x.sb', x: 1 }])[0].x, 1);
});

// @include が本文の後ろにある図(primary の 12 枚の形)では、共通部の block を取り込み側の block に重ねた診断が共通部の行に付く。
// 相手が取り込み側の行なら取り込み側の図の診断として数え、その行で出す(BLK-owner-20260926-2005-1)
test('includeImpact: @include が本文の後ろの図で、共通部の block を取り込み側の block に重ねると取り込み側の行で出る', () => {
  const tail = p => `@canvas width=960 height=520 grid=20\nblock ${p}drv "${p}Drv" at 4,4 size 8x3\n${p}drv -> rte\n@include "shared/common.sb"`;
  const files = { 'adc_swc.sb': tail('adc'), 'can_swc.sb': tail('can'), 'common.sb': IMP_COMMON };
  const base = IMP_COMMON;
  const r = includeImpact({ ...files, 'common.sb': base.replace('block os "OS" at 20,8', 'block os "OS" at 4,4') }, 'common.sb', base, checkLoaded);
  const overlaps = r.added.filter(d => /重なっている/.test(d.msg));
  assert.deepEqual(overlaps.map(d => `${d.path}:${d.line}`), ['adc_swc.sb:2', 'can_swc.sb:2']);
  assert.match(overlaps[0].msg, /block「os」が block「adcdrv」\(L2\)に重なっている\(shared\/common\.sb L3\)/);
  // 共通部の中だけの重なり(os を rte に重ねる)は、@include が後ろでも数えない
  const inner = includeImpact({ ...files, 'common.sb': base.replace('block os "OS" at 20,8', 'block os "OS" at 21,3') }, 'common.sb', base, checkLoaded);
  assert.deepEqual(inner.added.filter(d => /重なっている/.test(d.msg)), []);
});

test('includeImpact: 取り込み側のキャンバスの外に出た共通部の block は、取り込み側の @canvas 行で出る', () => {
  const small = '@canvas width=600 height=400 grid=20\n@include "shared/common.sb"\nblock x "X" at 1,1 size 4x2';
  const files = { 'small.sb': small, 'common.sb': IMP_COMMON };
  const r = includeImpact({ ...files, 'common.sb': IMP_COMMON.replace('block hal "HAL" at 20,14', 'block hal "HAL" at 26,14') }, 'common.sb', IMP_COMMON, checkLoaded);
  assert.deepEqual(r.added.map(d => `${d.path}:${d.line}`), ['small.sb:1']);
  assert.match(r.added[0].msg, /block「hal」がキャンバス\(600×400\)の外に右へ 4 グリッドはみ出している/);
});

test('includeImpact: 共通部の ID を取り込み側の ID と同じにすると、@include が後ろの図でも取り込み側の定義の行で出る', () => {
  const tail = '@canvas width=960 height=520 grid=20\nblock adcdrv "AdcDrv" at 4,4 size 8x3\n@include "shared/common.sb"';
  const files = { 'adc_swc.sb': tail, 'common.sb': IMP_COMMON };
  const r = includeImpact({ ...files, 'common.sb': IMP_COMMON.replace('block hal "HAL"', 'block adcdrv "HAL"') }, 'common.sb', IMP_COMMON, checkLoaded);
  assert.deepEqual(r.added.map(d => `${d.path}:${d.line}:${d.level}`), ['adc_swc.sb:2:error']);
  assert.equal(r.added[0].msg, 'ID "adcdrv" が重複 (L2)(shared/common.sb L4)');
});

test('checkDiagram: 取れない style 値はその行で warn(画面・check と同じ文)。取れる値は出ない(BLK-porter-20260929-0530)', () => {
  const d = check('block a "A" at 1,1 size 6x3\nblock b "未対応" at 9,1 size 8x3 color=#EF4444 text=#FFFFFF style=dotted\n');
  assert.deepEqual(d, [{ line: 2, level: 'warn', msg: 'style=dotted は使えない。実線で描く(使える値: solid / dashed / bold)' }]);
  assert.deepEqual(check('block a "A" at 1,1 size 6x3 style=bold\nblock b "B" at 9,1 size 6x3 style=dashed\na -> b style=dashed route=ortho lpos=top\n'), []);
});

test('checkDiagram: 接続・@canvas の取れない値も行ごとに出る。ラベルの中の文字は見ない', () => {
  const d = check('@canvas grow=maybe\nblock a "A" at 1,1 size 6x3\nblock b "B" at 9,1 size 6x3\na -> b "route=bad" route=spline\n');
  assert.deepEqual(d.map(x => [x.line, x.msg.split('。')[0]]), [[1, 'grow=maybe は使えない'], [4, 'route=spline は使えない']]);
});

test('checkIncluded: include 先の取れない値は include 先の場所で出る', () => {
  const files = { 'main.sb': '@include "common.sb"\nblock a "A" at 1,1 size 6x3\n', 'common.sb': 'block c "C" at 9,1 size 6x3 style=dotted\n' };
  const exp = expandIncludes(files['main.sb'], p => files[p] ?? null, 'main.sb');
  const p = parseDSL(exp.text);
  const d = checkIncluded(p, exp, connectionPaths(p, 'curved'));
  assert.equal(d.length, 1);
  assert.equal(d[0].file, 'common.sb');
  assert.equal(d[0].fileLine, 1);
  assert.match(d[0].msg, /^style=dotted は使えない。/);
});

import { badAttrValues } from '../check-core.mjs';
test('badAttrValues: 数の属性(round / 接続の width / @canvas の width・height・grid)の取れない値は、実際に描く値を言う(BLK-porter-20260929-0511)', () => {
  assert.deepEqual(badAttrValues('block', ' round=abc').map(b => b.msg), ['round=abc は使えない。角の丸みを既定の 4 で描く(使える値: 0 以上の整数)']);
  assert.deepEqual(badAttrValues('note', ' round=8px').map(b => b.msg), ['round=8px は使えない。角の丸みを 8 で描く(使える値: 0 以上の整数)']);
  assert.deepEqual(badAttrValues('conn', ' width=thick lpos=diagonal').map(b => b.msg), [
    'lpos=diagonal は使えない。ラベルを線の右に置く(使える値: right / left / top / bottom / center)',
    'width=thick は使えない。線の太さを既定の 1.5 で描く(使える値: 0 以上の数)',
  ]);
  assert.deepEqual(badAttrValues('conn', ' width=1.2.3').map(b => b.msg), ['width=1.2.3 は使えない。線の太さを数字として読めない(使える値: 0 以上の数)']);
  assert.deepEqual(badAttrValues('canvas', ' width=wide height=300px grid=x').map(b => b.attr), ['width', 'height', 'grid']);
  // 取れる数は警告しない(小数の太さ、先頭 0 の整数も読める)
  assert.deepEqual(badAttrValues('block', ' round=0'), []);
  assert.deepEqual(badAttrValues('conn', ' width=2.5'), []);
  assert.deepEqual(badAttrValues('canvas', ' width=0960 height=640 grid=20'), []);
});
