import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConnectionShape } from '../emitter.js';

test('buildConnectionShape: single-direction arrow', () => {
  const conn = {
    from: 'a', to: 'b', label: '',
    color: '#64748B', style: 'solid', width: 1.5, bidir: false
  };
  const endpoints = { x1: 100000, y1: 100000, x2: 500000, y2: 100000 };
  const xml = buildConnectionShape(conn, 0, endpoints, 1);
  assert.ok(xml.includes('name="conn:0"'));
  assert.ok(xml.includes('straightConnector1'));
  assert.ok(xml.includes('<a:tailEnd type="triangle"/>'));
  assert.ok(!xml.includes('<a:headEnd'));
  assert.ok(xml.includes('val="64748B"'));
});

test('buildConnectionShape: bidirectional has both arrowheads', () => {
  const conn = {
    from: 'a', to: 'b', label: '',
    color: '#000000', style: 'solid', width: 1, bidir: true
  };
  const endpoints = { x1: 0, y1: 0, x2: 100000, y2: 0 };
  const xml = buildConnectionShape(conn, 0, endpoints, 1);
  assert.ok(xml.includes('<a:headEnd type="triangle"/>'));
  assert.ok(xml.includes('<a:tailEnd type="triangle"/>'));
});

test('buildConnectionShape: dashed style', () => {
  const conn = {
    from: 'a', to: 'b', label: '',
    color: '#000000', style: 'dashed', width: 1, bidir: false
  };
  const endpoints = { x1: 0, y1: 0, x2: 100000, y2: 0 };
  const xml = buildConnectionShape(conn, 0, endpoints, 1);
  assert.ok(xml.includes('<a:prstDash val="dash"/>'));
});

test('buildConnectionShape: width converts to EMU (1.5 px = 14288)', () => {
  const conn = {
    from: 'a', to: 'b', label: '',
    color: '#000000', style: 'solid', width: 1.5, bidir: false
  };
  const endpoints = { x1: 0, y1: 0, x2: 100000, y2: 0 };
  const xml = buildConnectionShape(conn, 0, endpoints, 1);
  assert.ok(xml.includes('w="14288"'));
});

test('buildConnectionShape: reversed coords use flipH', () => {
  const conn = {
    from: 'a', to: 'b', label: '',
    color: '#000000', style: 'solid', width: 1, bidir: false
  };
  // x1 > x2 → flipH=true
  const endpoints = { x1: 500000, y1: 0, x2: 100000, y2: 0 };
  const xml = buildConnectionShape(conn, 0, endpoints, 1);
  assert.ok(xml.includes('flipH="true"'));
});
