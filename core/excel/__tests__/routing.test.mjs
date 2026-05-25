import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centerOfShape, midpointsOfShape, computeConnectionEndpoints } from '../emitter.js';

test('centerOfShape: 1,1 size 5x3 grid=20 -> center at (3.5, 2.5) grid', () => {
  const r = centerOfShape({ x: 1, y: 1, w: 5, h: 3 }, 20);
  // 中心 px = ((1 + 5/2) * 20, (1 + 3/2) * 20) = (70, 50)
  // EMU = (70*9525, 50*9525) = (666750, 476250)
  assert.equal(r.x, 666750);
  assert.equal(r.y, 476250);
});

test('midpointsOfShape: 1,1 size 5x3 grid=20 returns 4 edge midpoints in EMU', () => {
  const m = midpointsOfShape({ x: 1, y: 1, w: 5, h: 3 }, 20);
  // N = top midpoint: ((1 + 5/2) * 20, 1 * 20) = (70, 20) px = (666750, 190500) EMU
  assert.deepEqual(m.N, { x: 666750, y: 190500 });
  // E = right midpoint: ((1+5) * 20, (1 + 3/2) * 20) = (120, 50) px = (1143000, 476250) EMU
  assert.deepEqual(m.E, { x: 1143000, y: 476250 });
  // S = bottom midpoint: (70, (1+3)*20) = (70, 80) px = (666750, 762000) EMU
  assert.deepEqual(m.S, { x: 666750, y: 762000 });
  // W = left midpoint: (1*20, 50) = (20, 50) px = (190500, 476250) EMU
  assert.deepEqual(m.W, { x: 190500, y: 476250 });
});

test('computeConnectionEndpoints: horizontal layout picks E->W (nearest pair)', () => {
  const blockMap = {
    a: { x: 0, y: 0, w: 2, h: 2 },     // E midpoint: (2, 1) grid = (40, 20) px
    b: { x: 10, y: 0, w: 2, h: 2 }     // W midpoint: (10, 1) grid = (200, 20) px
  };
  const ep = computeConnectionEndpoints({ from: 'a', to: 'b' }, blockMap, 20);
  // Expect a.E -> b.W = (40,20) -> (200,20) in px
  // EMU: (40*9525, 20*9525) -> (200*9525, 20*9525)
  assert.equal(ep.x1, 381000);   // 40 * 9525
  assert.equal(ep.y1, 190500);   // 20 * 9525
  assert.equal(ep.x2, 1905000);  // 200 * 9525
  assert.equal(ep.y2, 190500);
});

test('computeConnectionEndpoints: vertical layout picks S->N (nearest pair)', () => {
  const blockMap = {
    a: { x: 0, y: 0, w: 2, h: 2 },     // S midpoint: (1, 2) grid = (20, 40) px
    b: { x: 0, y: 10, w: 2, h: 2 }     // N midpoint: (1, 10) grid = (20, 200) px
  };
  const ep = computeConnectionEndpoints({ from: 'a', to: 'b' }, blockMap, 20);
  assert.equal(ep.x1, 190500);   // 20 * 9525
  assert.equal(ep.y1, 381000);   // 40 * 9525
  assert.equal(ep.x2, 190500);
  assert.equal(ep.y2, 1905000);  // 200 * 9525
});

test('computeConnectionEndpoints: returns null if endpoint missing', () => {
  const blockMap = { a: { x: 0, y: 0, w: 2, h: 2 } };
  const ep = computeConnectionEndpoints({ from: 'a', to: 'missing' }, blockMap, 20);
  assert.equal(ep, null);
});
