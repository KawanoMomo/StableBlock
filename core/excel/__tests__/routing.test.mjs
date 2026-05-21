import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centerOfShape, computeConnectionEndpoints } from '../emitter.js';

test('centerOfShape: 1,1 size 5x3 grid=20 -> center at (3.5, 2.5) grid', () => {
  const r = centerOfShape({ x: 1, y: 1, w: 5, h: 3 }, 20);
  // 中心 px = ((1 + 5/2) * 20, (1 + 3/2) * 20) = (70, 50)
  // EMU = (70*9525, 50*9525) = (666750, 476250)
  assert.equal(r.x, 666750);
  assert.equal(r.y, 476250);
});

test('computeConnectionEndpoints: returns from-center and to-center', () => {
  const blockMap = {
    a: { x: 0, y: 0, w: 2, h: 2 },
    b: { x: 10, y: 0, w: 2, h: 2 }
  };
  const conn = { from: 'a', to: 'b' };
  const ep = computeConnectionEndpoints(conn, blockMap, 20);
  // a center px = (1*20, 1*20) = (20, 20) -> EMU (190500, 190500)
  // b center px = (11*20, 1*20) = (220, 20) -> EMU (2095500, 190500)
  assert.deepEqual(ep, { x1: 190500, y1: 190500, x2: 2095500, y2: 190500 });
});

test('computeConnectionEndpoints: returns null if endpoint missing', () => {
  const blockMap = { a: { x: 0, y: 0, w: 2, h: 2 } };
  const conn = { from: 'a', to: 'missing' };
  const ep = computeConnectionEndpoints(conn, blockMap, 20);
  assert.equal(ep, null);
});
