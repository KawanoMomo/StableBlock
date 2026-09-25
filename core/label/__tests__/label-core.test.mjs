import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extendPoint, bezierControls, bezierMidpoint, orthoPoints, polylineMidpoint,
  parseLpos, labelLayout, setConnLabelInDsl,
} from '../label-core.mjs';

test('extendPoint moves point in side direction', () => {
  assert.deepEqual(extendPoint({ x: 10, y: 20 }, 'top', 5), { x: 10, y: 15 });
  assert.deepEqual(extendPoint({ x: 10, y: 20 }, 'bottom', 5), { x: 10, y: 25 });
  assert.deepEqual(extendPoint({ x: 10, y: 20 }, 'left', 5), { x: 5, y: 20 });
  assert.deepEqual(extendPoint({ x: 10, y: 20 }, 'right', 5), { x: 15, y: 20 });
});

test('bezierControls matches legacy bpath math (dist>=75 => cpd=dist*0.4)', () => {
  // dist=100, cpd=40
  const { c1, c2 } = bezierControls({ x: 0, y: 0 }, { x: 100, y: 0 }, 'right', 'left');
  assert.deepEqual(c1, { x: 40, y: 0 });
  assert.deepEqual(c2, { x: 60, y: 0 });
});

test('bezierControls floors cpd at 30 for short distances', () => {
  // dist=10 => cpd=30
  const { c1, c2 } = bezierControls({ x: 0, y: 0 }, { x: 10, y: 0 }, 'right', 'left');
  assert.deepEqual(c1, { x: 30, y: 0 });
  assert.deepEqual(c2, { x: -20, y: 0 });
});

test('bezierMidpoint is (P0+3C1+3C2+P3)/8', () => {
  const mid = bezierMidpoint({ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 60, y: 0 }, { x: 100, y: 0 });
  assert.deepEqual(mid, { x: 50, y: 0 });
  const mid2 = bezierMidpoint({ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 100, y: 60 }, { x: 100, y: 100 });
  assert.deepEqual(mid2, { x: 50, y: 50 });
});

test('orthoPoints horizontal-horizontal produces 6-point polyline', () => {
  // fs=right, ts=left => e1={20,0}, e2={80,60}, mx=50
  const pts = orthoPoints({ x: 0, y: 0 }, { x: 100, y: 60 }, 'right', 'left');
  assert.deepEqual(pts, [
    { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 50, y: 0 },
    { x: 50, y: 60 }, { x: 80, y: 60 }, { x: 100, y: 60 },
  ]);
});

test('orthoPoints vertical-vertical produces 6-point polyline', () => {
  // fs=bottom, ts=top => e1={0,20}, e2={100,40}, my=30
  const pts = orthoPoints({ x: 0, y: 0 }, { x: 100, y: 60 }, 'bottom', 'top');
  assert.deepEqual(pts, [
    { x: 0, y: 0 }, { x: 0, y: 20 }, { x: 0, y: 30 },
    { x: 100, y: 30 }, { x: 100, y: 40 }, { x: 100, y: 60 },
  ]);
});

test('orthoPoints vertical-horizontal produces 5-point polyline', () => {
  // fs=bottom(isVF), ts=left(!isVT) => e1={0,20}, e2={80,60} => corner {e1.x, e2.y}
  const pts = orthoPoints({ x: 0, y: 0 }, { x: 100, y: 60 }, 'bottom', 'left');
  assert.deepEqual(pts, [
    { x: 0, y: 0 }, { x: 0, y: 20 }, { x: 0, y: 60 }, { x: 80, y: 60 }, { x: 100, y: 60 },
  ]);
});

test('orthoPoints horizontal-vertical produces 5-point polyline', () => {
  // fs=right(!isVF), ts=top(isVT) => e1={20,0}, e2={100,40} => corner {e2.x, e1.y}
  const pts = orthoPoints({ x: 0, y: 0 }, { x: 100, y: 60 }, 'right', 'top');
  assert.deepEqual(pts, [
    { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }, { x: 100, y: 60 },
  ]);
});

test('polylineMidpoint finds half-length point on middle segment', () => {
  // 上のHHケース: 区間長 20,30,60,30,20 / 全長160 / 半分80 => 第3区間(垂直)の30px地点
  const pts = [
    { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 50, y: 0 },
    { x: 50, y: 60 }, { x: 80, y: 60 }, { x: 100, y: 60 },
  ];
  assert.deepEqual(polylineMidpoint(pts), { x: 50, y: 30 });
});

test('polylineMidpoint handles degenerate zero-length polyline', () => {
  assert.deepEqual(polylineMidpoint([{ x: 5, y: 5 }, { x: 5, y: 5 }]), { x: 5, y: 5 });
});

test('parseLpos extracts value with right default and fallback', () => {
  assert.equal(parseLpos('lpos=left'), 'left');
  assert.equal(parseLpos('color=#fff lpos=center width=2'), 'center');
  assert.equal(parseLpos(''), 'right');
  assert.equal(parseLpos(undefined), 'right');
  assert.equal(parseLpos('lpos=weird'), 'right');
  assert.equal(parseLpos('color=#64748B'), 'right');
});

test('labelLayout right: text starts 10px right of mid, bg wraps text', () => {
  const L = labelLayout({ x: 100, y: 50 }, 'right', 30);
  assert.equal(L.tx, 110);
  assert.equal(L.ty, 50);
  assert.equal(L.anchor, 'start');
  assert.deepEqual(L.bg, { x: 106, y: 43, w: 38, h: 14, rx: 2 });
});

test('labelLayout left: text ends 10px left of mid', () => {
  const L = labelLayout({ x: 100, y: 50 }, 'left', 30);
  assert.equal(L.tx, 90);
  assert.equal(L.anchor, 'end');
  assert.deepEqual(L.bg, { x: 56, y: 43, w: 38, h: 14, rx: 2 });
});

test('labelLayout top/bottom: ty offset, centered horizontally', () => {
  const t = labelLayout({ x: 100, y: 50 }, 'top', 30);
  assert.equal(t.tx, 100);
  assert.equal(t.ty, 40);
  assert.equal(t.anchor, 'middle');
  assert.deepEqual(t.bg, { x: 81, y: 33, w: 38, h: 14, rx: 2 });
  const b = labelLayout({ x: 100, y: 50 }, 'bottom', 30);
  assert.equal(b.ty, 60);
  assert.deepEqual(b.bg, { x: 81, y: 53, w: 38, h: 14, rx: 2 });
});

test('labelLayout center: no offset', () => {
  const L = labelLayout({ x: 100, y: 50 }, 'center', 30);
  assert.equal(L.tx, 100);
  assert.equal(L.ty, 50);
  assert.equal(L.anchor, 'middle');
  assert.deepEqual(L.bg, { x: 81, y: 43, w: 38, h: 14, rx: 2 });
});

test('setConnLabelInDsl replaces existing label', () => {
  const dsl = 'block a "A" at 1,1 size 4x2\na -> b "old" color=#fff';
  assert.equal(setConnLabelInDsl(dsl, 'a', 'b', 'new'),
    'block a "A" at 1,1 size 4x2\na -> b "new" color=#fff');
});

test('setConnLabelInDsl inserts label before existing attributes', () => {
  assert.equal(setConnLabelInDsl('a -> b color=#fff', 'a', 'b', 'x'),
    'a -> b "x" color=#fff');
  assert.equal(setConnLabelInDsl('a --> b', 'a', 'b', 'x'), 'a --> b "x"');
});

test('setConnLabelInDsl removes label on empty string (ECN-002: 行は残す)', () => {
  assert.equal(setConnLabelInDsl('a -> b "old" width=2', 'a', 'b', ''),
    'a -> b width=2');
  assert.equal(setConnLabelInDsl('a -> b "old"', 'a', 'b', ''), 'a -> b');
});

test('setConnLabelInDsl matches direction-agnostically like setConnProp', () => {
  assert.equal(setConnLabelInDsl('b -> a "old"', 'a', 'b', 'new'), 'b -> a "new"');
});

test('setConnLabelInDsl strips double quotes from input', () => {
  assert.equal(setConnLabelInDsl('a -> b', 'a', 'b', 'say "hi"'), 'a -> b "say hi"');
});

test('setConnLabelInDsl is safe with $ patterns in label', () => {
  assert.equal(setConnLabelInDsl('a -> b "old"', 'a', 'b', 'cost $1 $& $$'),
    'a -> b "cost $1 $& $$"');
});

test('setConnLabelInDsl no-op when no matching connection', () => {
  assert.equal(setConnLabelInDsl('a -> b "old"', 'x', 'y', 'new'), 'a -> b "old"');
});

test('setConnLabelInDsl preserves leading whitespace and touches first match only', () => {
  const dsl = '  a -> b "one"\na -> b "two"';
  assert.equal(setConnLabelInDsl(dsl, 'a', 'b', 'z'), '  a -> b "z"\na -> b "two"');
});

// ─── ID ───
import { isValidId, labelToId, uniqueId, renameIdInDsl } from '../label-core.mjs';

test('labelToId keeps case and underscores', () => {
  assert.equal(labelToId('Spi_Api'), 'Spi_Api');
  assert.equal(labelToId('Spi Driver'), 'Spi_Driver');
  assert.equal(labelToId('App\nSWC'), 'App_SWC');
  assert.equal(labelToId('SPI ドライバ'), 'SPI');
  assert.equal(labelToId('ドライバ'), '');
  assert.equal(labelToId('A'.repeat(40)).length, 30);
});

test('isValidId accepts alnum and underscore only', () => {
  assert.ok(isValidId('Spi_Driver'));
  assert.ok(isValidId('a1'));
  assert.ok(!isValidId(''));
  assert.ok(!isValidId('a b'));
  assert.ok(!isValidId('a-b'));
  assert.ok(!isValidId('ドライバ'));
});

test('uniqueId appends _N on collision', () => {
  assert.equal(uniqueId('a', new Set()), 'a');
  assert.equal(uniqueId('a', new Set(['a'])), 'a_2');
  assert.equal(uniqueId('a', ['a', 'a_2']), 'a_3');
});

test('renameIdInDsl rewrites only the definition and connection endpoints', () => {
  const dsl = [
    'block SpiDrv "SpiDrv の上" at 1,1 size 4x2',
    'block app "App" at 8,1 size 4x2',
    'app -> SpiDrv "SpiDrv へ"',
    'SpiDrv --> app color=#EF4444',
    '# SpiDrv はコメント',
    'block SpiDrv2 "x" at 1,5 size 4x2',
    'SpiDrv2 -> app',
  ].join('\n');
  const out = renameIdInDsl(dsl, 'SpiDrv', 'Spi_Driver').split('\n');
  assert.equal(out[0], 'block Spi_Driver "SpiDrv の上" at 1,1 size 4x2');
  assert.equal(out[2], 'app -> Spi_Driver "SpiDrv へ"');
  assert.equal(out[3], 'Spi_Driver --> app color=#EF4444');
  assert.equal(out[4], '# SpiDrv はコメント');
  assert.equal(out[5], 'block SpiDrv2 "x" at 1,5 size 4x2');
  assert.equal(out[6], 'SpiDrv2 -> app');
});

test('renameIdInDsl keeps indentation and spacing', () => {
  const dsl = '  note  m1 "memo" at 1,1 size 4x2\nm1   ->   b';
  assert.equal(renameIdInDsl(dsl, 'm1', 'Memo'), '  note  Memo "memo" at 1,1 size 4x2\nMemo   ->   b');
});

test('renameIdInDsl with duplicate ids renames the given line only and leaves connections', () => {
  const dsl = 'block a "A" at 1,1 size 4x2\nblock a "A2" at 8,1 size 4x2\na -> b';
  assert.equal(renameIdInDsl(dsl, 'a', 'a_2', 2), 'block a "A" at 1,1 size 4x2\nblock a_2 "A2" at 8,1 size 4x2\na -> b');
});

test('renameIdInDsl returns dsl unchanged when the id is absent', () => {
  assert.equal(renameIdInDsl('block a "A" at 1,1 size 4x2', 'zz', 'y'), 'block a "A" at 1,1 size 4x2');
});
