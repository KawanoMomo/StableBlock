import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centerOfShape, getSide, portPos, computeAllPorts, computeConnectionEndpoints } from '../emitter.js';

test('centerOfShape: 1,1 size 5x3 grid=20 -> center in EMU', () => {
  const r = centerOfShape({ x: 1, y: 1, w: 5, h: 3 }, 20);
  // center px = (70, 50) -> EMU (666750, 476250)
  assert.equal(r.x, 666750);
  assert.equal(r.y, 476250);
});

test('getSide: horizontal layout picks right->left', () => {
  // a is at left, b is at right with gap
  const a = { x: 0, y: 0, w: 2, h: 2 };
  const b = { x: 10, y: 0, w: 2, h: 2 };
  assert.deepEqual(getSide(a, b), { fs: 'right', ts: 'left' });
});

test('getSide: vertical layout picks bottom->top', () => {
  const a = { x: 0, y: 0, w: 2, h: 2 };
  const b = { x: 0, y: 10, w: 2, h: 2 };
  assert.deepEqual(getSide(a, b), { fs: 'bottom', ts: 'top' });
});

test('getSide: reversed horizontal picks left->right', () => {
  const a = { x: 10, y: 0, w: 2, h: 2 };
  const b = { x: 0, y: 0, w: 2, h: 2 };
  assert.deepEqual(getSide(a, b), { fs: 'left', ts: 'right' });
});

test('portPos: single port lands at midpoint', () => {
  const b = { x: 0, y: 0, w: 4, h: 2 };
  // grid=20: bx=0, by=0, bw=80, bh=40. side=right, idx=0, total=1, t=0.5
  // expected x = bx + bw = 80, y = by + bh*0.5 = 20
  assert.deepEqual(portPos(b, 'right', 0, 1, 20), { x: 80, y: 20 });
});

test('portPos: 2 ports on top side are distributed at pad=0.2 and 1-pad', () => {
  const b = { x: 0, y: 0, w: 4, h: 2 };
  // bx=0, by=0, bw=80, bh=40. side=top: t = 0.2 for idx=0, 0.8 for idx=1
  const p0 = portPos(b, 'top', 0, 2, 20);
  const p1 = portPos(b, 'top', 1, 2, 20);
  // p0.x = 80*0.2 = 16, p0.y = 0
  // p1.x = 80*0.8 = 64, p1.y = 0
  assert.deepEqual(p0, { x: 16, y: 0 });
  assert.deepEqual(p1, { x: 64, y: 0 });
});

test('computeAllPorts: single horizontal connection -> right and left midpoints', () => {
  const conns = [{ from: 'a', to: 'b' }];
  const blockMap = {
    a: { x: 0, y: 0, w: 2, h: 2 },
    b: { x: 10, y: 0, w: 2, h: 2 }
  };
  const ports = computeAllPorts(conns, blockMap, 20);
  // a.right midpoint: x=2*20=40, y=0+1*20=20
  // b.left midpoint:  x=10*20=200, y=0+1*20=20
  assert.deepEqual(ports[0].fp, { x: 40, y: 20 });
  assert.deepEqual(ports[0].tp, { x: 200, y: 20 });
  assert.equal(ports[0].fs, 'right');
  assert.equal(ports[0].ts, 'left');
});

test('computeAllPorts: missing endpoint -> null', () => {
  const ports = computeAllPorts([{ from: 'a', to: 'missing' }], { a: { x:0, y:0, w:2, h:2 } }, 20);
  assert.equal(ports[0], null);
});

test('computeConnectionEndpoints: legacy single-conn API returns EMU endpoints', () => {
  const blockMap = {
    a: { x: 0, y: 0, w: 2, h: 2 },
    b: { x: 10, y: 0, w: 2, h: 2 }
  };
  const ep = computeConnectionEndpoints({ from: 'a', to: 'b' }, blockMap, 20);
  // a.right (40px, 20px) -> EMU (381000, 190500)
  // b.left  (200px, 20px) -> EMU (1905000, 190500)
  assert.equal(ep.x1, 381000);
  assert.equal(ep.y1, 190500);
  assert.equal(ep.x2, 1905000);
  assert.equal(ep.y2, 190500);
});

test('computeConnectionEndpoints: missing endpoint -> null', () => {
  const ep = computeConnectionEndpoints({ from: 'a', to: 'missing' }, { a: { x:0,y:0,w:2,h:2 } }, 20);
  assert.equal(ep, null);
});
