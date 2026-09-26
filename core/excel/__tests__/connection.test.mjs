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

import { buildConnectionLabel } from '../emitter.js';

test('buildConnectionLabel: places textbox at midpoint', () => {
  const xml = buildConnectionLabel(
    { from: 'a', to: 'b', label: 'request' },
    0,
    { x1: 100000, y1: 100000, x2: 500000, y2: 100000 },
    99
  );
  assert.ok(xml.includes('name="connlabel:0"'));
  assert.ok(xml.includes('request'));
  // midX = 300000 - 250000 (textbox half width) = 50000
  assert.ok(xml.includes('x="50000"'));
});

test('buildConnectionLabel: escapes special chars in label', () => {
  const xml = buildConnectionLabel(
    { from: 'a', to: 'b', label: '<X & Y>' },
    0,
    { x1: 0, y1: 0, x2: 100000, y2: 0 },
    99
  );
  assert.ok(xml.includes('&lt;X &amp; Y&gt;'));
  assert.ok(!xml.includes('<X & Y>'));
});

test('buildConnectionLabel: includes font specs', () => {
  const xml = buildConnectionLabel(
    { from: 'a', to: 'b', label: 'request' },
    0,
    { x1: 100000, y1: 100000, x2: 500000, y2: 100000 },
    99
  );
  assert.ok(xml.includes('<a:latin typeface="Calibri"/>'));
  assert.ok(xml.includes('<a:ea typeface="Yu Gothic UI"/>'));
});

test('buildConnectionLabel: DSL 2-char \\n splits label', () => {
  const xml = buildConnectionLabel(
    { from: 'a', to: 'b', label: 'A\\nB' },
    0,
    { x1: 0, y1: 0, x2: 100000, y2: 0 },
    99
  );
  const pCount = (xml.match(/<a:p>/g) || []).length;
  assert.equal(pCount, 2);
});

// Excel の接続線は直線だけ・ラベルは中点だけ。画面と違うものは書き出し後の一覧に出す(BLK-builder-20260926-1230-1)
import { listXlsxDrops as xlsxDrops } from '../emitter.js';
import { parseDSL as parseSb } from '../../dsl/dsl-core.mjs';

test('listXlsxDrops: 線の形(既定の曲線・直角)と lpos= を数えて知らせ、直線と lpos=center は知らせない', () => {
  const src = (canvas, conns) => [canvas, 'block a "A" at 1,1 size 4x2', 'block b "B" at 8,1 size 4x2', 'block c "C" at 1,6 size 4x2', ...conns].join('\n');
  assert.deepEqual(xlsxDrops(parseSb(src('@canvas', ['a -> b "x" lpos=top', 'b -> c route=ortho', 'a -> c "y" route=straight lpos=center']))), [
    '接続の線の形(曲線 1 本・直角 1 本。Excel では直線になる)',
    '接続ラベルの位置 lpos=(1 本。Excel では線の中点に置く)',
  ]);
  assert.deepEqual(xlsxDrops(parseSb(src('@canvas route=straight', ['a -> b "x"', 'b -> c']))), []);
  assert.deepEqual(xlsxDrops(parseSb(src('@canvas route=ortho', ['a -> b', 'b -> zz']))), [
    '接続 b -> zz(zz が図に無い)',
    '接続の線の形(直角 1 本。Excel では直線になる)',
  ]);
});
