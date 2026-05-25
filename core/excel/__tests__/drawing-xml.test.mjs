import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDrawingXml } from '../emitter.js';

test('buildDrawingXml: empty AST produces valid empty drawing', () => {
  const ast = {
    canvas: { width: 400, height: 200, grid: 20 },
    blocks: [], groups: [], notes: [], connections: [],
    blockMap: {}
  };
  const xml = buildDrawingXml(ast);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'));
  assert.ok(xml.includes('xdr:wsDr'));
  assert.ok(xml.includes('xmlns:xdr='));
  assert.ok(xml.includes('xmlns:a='));
});

test('buildDrawingXml: minimal AST emits all shape types in z-order', () => {
  const ast = {
    canvas: { width: 400, height: 200, grid: 20 },
    blocks: [
      { id: 'a', label: 'A', x: 1, y: 1, w: 3, h: 2, color: '#FF0000', textColor: '#FFF', borderColor: null, round: 0, style: 'solid' },
      { id: 'b', label: 'B', x: 8, y: 1, w: 3, h: 2, color: '#00FF00', textColor: '#FFF', borderColor: null, round: 0, style: 'solid' }
    ],
    groups: [
      { id: 'g', label: 'G', x: 0, y: 0, w: 12, h: 4, color: '#EEEEEE', borderColor: '#999999' }
    ],
    notes: [
      { id: 'n', label: 'N', x: 0, y: 5, w: 5, h: 2, color: '#FEF3C7', textColor: '#92400E', borderColor: null, round: 4, style: 'solid' }
    ],
    connections: [
      { from: 'a', to: 'b', label: 'r', color: '#000000', style: 'solid', width: 1, bidir: false }
    ],
    blockMap: { a: { x: 1, y: 1, w: 3, h: 2 }, b: { x: 8, y: 1, w: 3, h: 2 } }
  };
  const xml = buildDrawingXml(ast);
  const groupIdx = xml.indexOf('group:g');
  const connIdx = xml.indexOf('conn:0');
  const labelIdx = xml.indexOf('connlabel:0');
  const blockAIdx = xml.indexOf('block:a');
  const noteIdx = xml.indexOf('note:n');
  assert.ok(groupIdx < connIdx, 'group before connection');
  assert.ok(connIdx < labelIdx, 'connection before label');
  assert.ok(labelIdx < blockAIdx, 'label before block');
  assert.ok(blockAIdx < noteIdx, 'block before note');
});

test('buildDrawingXml: skips connection with missing endpoint and warns', () => {
  const ast = {
    canvas: { width: 400, height: 200, grid: 20 },
    blocks: [{ id: 'a', label: 'A', x: 1, y: 1, w: 3, h: 2, color: '#FFF', textColor: '#000', borderColor: null, round: 0, style: 'solid' }],
    groups: [], notes: [],
    connections: [{ from: 'a', to: 'nonexistent', label: '', color: '#000000', style: 'solid', width: 1, bidir: false }],
    blockMap: { a: { x: 1, y: 1, w: 3, h: 2 } }
  };
  const xml = buildDrawingXml(ast);
  assert.ok(!xml.includes('conn:0'));  // skipped invalid connection
});
