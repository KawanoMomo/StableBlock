import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseSides, buildCanvas, canvasJson } from '../emitter.mjs';

// 共有フィクスチャ: 2ブロック+グループ+note+接続4本(通常/双方向/注釈/欠損ID)
function fixture() {
  return {
    canvas: { width: 960, height: 640, grid: 20 },
    blocks: [
      { type: 'block', id: 'a', label: 'A\\nsub', x: 2, y: 2, w: 8, h: 3, color: '#6366F1' },
      { type: 'block', id: 'b', label: 'B', x: 30, y: 2, w: 8, h: 3, color: '#3B82F6' },
    ],
    groups: [
      { type: 'group', id: 'app', label: 'App', x: 1, y: 1, w: 40, h: 6, color: '#F3F4F6' },
    ],
    notes: [
      { type: 'note', id: 'memo', label: 'メモ', x: 2, y: 10, w: 6, h: 2, color: '#FEF3C7' },
    ],
    connections: [
      { from: 'a', to: 'b', label: 'payload', color: '#64748B', bidir: false },
      { from: 'b', to: 'a', label: '', color: '#EF4444', bidir: true },
      { from: 'memo', to: 'a', label: '', color: '#F59E0B', bidir: false },
      { from: 'a', to: 'ghost', label: '', color: '#000000', bidir: false },
    ],
  };
}

test('chooseSides matches legacy getSide gap comparison', () => {
  // 水平: a(2,2,8x3) → b(30,2,8x3): gapR=30-10=20 が最大
  assert.deepEqual(
    chooseSides({ x: 2, y: 2, w: 8, h: 3 }, { x: 30, y: 2, w: 8, h: 3 }),
    { fromSide: 'right', toSide: 'left' });
  // 逆方向: gapL=30-10=20
  assert.deepEqual(
    chooseSides({ x: 30, y: 2, w: 8, h: 3 }, { x: 2, y: 2, w: 8, h: 3 }),
    { fromSide: 'left', toSide: 'right' });
  // 垂直: memo(2,10,6x2) → a(2,2,8x3): gapT=10-5=5 が最大
  assert.deepEqual(
    chooseSides({ x: 2, y: 10, w: 6, h: 2 }, { x: 2, y: 2, w: 8, h: 3 }),
    { fromSide: 'top', toSide: 'bottom' });
  // 下方向: a → memo
  assert.deepEqual(
    chooseSides({ x: 2, y: 2, w: 8, h: 3 }, { x: 2, y: 10, w: 6, h: 2 }),
    { fromSide: 'bottom', toSide: 'top' });
});

test('buildCanvas: nodes are groups then blocks, grid*20 px, \\n converted', () => {
  const { nodes } = buildCanvas(fixture(), { showAnnotations: false });
  assert.deepEqual(nodes, [
    { id: 'app', type: 'group', label: 'App', x: 20, y: 20, width: 800, height: 120, color: '#F3F4F6' },
    { id: 'a', type: 'text', text: 'A\nsub', x: 40, y: 40, width: 160, height: 60, color: '#6366F1' },
    { id: 'b', type: 'text', text: 'B', x: 600, y: 40, width: 160, height: 60, color: '#3B82F6' },
  ]);
});

test('buildCanvas: normal edges with sides, label omitted when empty, bidir fromEnd', () => {
  const { edges } = buildCanvas(fixture(), { showAnnotations: false });
  assert.deepEqual(edges, [
    { id: 'e-a-b-0', fromNode: 'a', fromSide: 'right', toNode: 'b', toSide: 'left', color: '#64748B', label: 'payload' },
    { id: 'e-b-a-1', fromNode: 'b', fromSide: 'left', toNode: 'a', toSide: 'right', color: '#EF4444', fromEnd: 'arrow' },
  ]);
});

test('buildCanvas: missing-endpoint connection is dropped and does not consume seq', () => {
  const { edges } = buildCanvas(fixture(), { showAnnotations: false });
  assert.equal(edges.length, 2);
  assert.ok(!edges.some((e) => e.toNode === 'ghost'));
});

test('buildCanvas: showAnnotations=true adds note node and annotation edge at the end', () => {
  const { nodes, edges } = buildCanvas(fixture(), { showAnnotations: true });
  assert.deepEqual(nodes[3],
    { id: 'memo', type: 'text', text: 'メモ', x: 40, y: 200, width: 120, height: 40, color: '#FEF3C7' });
  assert.deepEqual(edges[2],
    { id: 'e-memo-a-2', fromNode: 'memo', fromSide: 'top', toNode: 'a', toSide: 'bottom', color: '#F59E0B' });
});

test('buildCanvas: showAnnotations=false excludes notes and annotation edges', () => {
  const { nodes, edges } = buildCanvas(fixture(), { showAnnotations: false });
  assert.equal(nodes.length, 3);
  assert.equal(edges.length, 2);
});

test('canvasJson: golden output with tab indent', () => {
  const json = canvasJson(fixture(), { showAnnotations: false });
  const parsed = JSON.parse(json);
  assert.deepEqual(parsed, buildCanvas(fixture(), { showAnnotations: false }));
  assert.ok(json.startsWith('{\n\t"nodes": ['));
  assert.ok(json.includes('\n\t\t{\n\t\t\t"id": "app",'));
});
