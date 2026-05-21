import { test } from 'node:test';
import assert from 'node:assert/strict';
import { XMLParser } from 'fast-xml-parser';
import { buildBlockShape } from '../emitter.js';

const parser = new XMLParser({ ignoreAttributes: false });

test('buildBlockShape: minimal block', () => {
  const block = {
    id: 'ui', label: 'UI',
    x: 1, y: 1, w: 5, h: 3,
    color: '#3B82F6', textColor: '#FFFFFF',
    borderColor: null, round: 4, style: 'solid'
  };
  const xml = buildBlockShape(block, 2, 20);
  const parsed = parser.parse(xml);
  const anchor = parsed['xdr:absoluteAnchor'];
  assert.equal(anchor['xdr:pos']['@_x'], '190500');
  assert.equal(anchor['xdr:pos']['@_y'], '190500');
  assert.equal(anchor['xdr:ext']['@_cx'], '952500');
  assert.equal(anchor['xdr:ext']['@_cy'], '571500');
  assert.equal(anchor['xdr:sp']['xdr:nvSpPr']['xdr:cNvPr']['@_id'], '2');
  assert.equal(anchor['xdr:sp']['xdr:nvSpPr']['xdr:cNvPr']['@_name'], 'block:ui');
});

test('buildBlockShape: label is escaped', () => {
  const block = {
    id: 'a', label: 'A & B',
    x: 0, y: 0, w: 2, h: 2,
    color: '#FFFFFF', textColor: '#000000',
    borderColor: null, round: 0, style: 'solid'
  };
  const xml = buildBlockShape(block, 1, 20);
  assert.ok(xml.includes('A &amp; B'));
  assert.ok(!xml.includes('A & B'));
});

test('buildBlockShape: round=0 produces rect not roundRect', () => {
  const block = {
    id: 'a', label: 'A',
    x: 0, y: 0, w: 2, h: 2,
    color: '#FFFFFF', textColor: '#000000',
    borderColor: null, round: 0, style: 'solid'
  };
  const xml = buildBlockShape(block, 1, 20);
  assert.ok(xml.includes('prst="rect"'));
  assert.ok(!xml.includes('roundRect'));
});

test('buildBlockShape: round=8 includes adj value', () => {
  const block = {
    id: 'a', label: 'A',
    x: 0, y: 0, w: 2, h: 2,
    color: '#FFFFFF', textColor: '#000000',
    borderColor: null, round: 8, style: 'solid'
  };
  const xml = buildBlockShape(block, 1, 20);
  assert.ok(xml.includes('roundRect'));
  assert.ok(xml.includes('val 40000'));  // 8 * 5000
});

test('buildBlockShape: border color produces line solidFill', () => {
  const block = {
    id: 'a', label: 'A',
    x: 0, y: 0, w: 2, h: 2,
    color: '#FFFFFF', textColor: '#000000',
    borderColor: '#FF0000', round: 0, style: 'solid'
  };
  const xml = buildBlockShape(block, 1, 20);
  assert.ok(xml.match(/<a:ln>\s*<a:solidFill><a:srgbClr val="FF0000"\/><\/a:solidFill>\s*<\/a:ln>/));
});

test('buildBlockShape: \\n in label splits into multiple <a:p>', () => {
  const block = {
    id: 'a', label: 'Line1\nLine2',
    x: 0, y: 0, w: 2, h: 2,
    color: '#FFFFFF', textColor: '#000000',
    borderColor: null, round: 0, style: 'solid'
  };
  const xml = buildBlockShape(block, 1, 20);
  const pCount = (xml.match(/<a:p>/g) || []).length;
  assert.equal(pCount, 2);
});

import { buildGroupShape } from '../emitter.js';

test('buildGroupShape: basic group with label', () => {
  const group = {
    id: 'app', label: 'Application',
    x: 1, y: 1, w: 20, h: 10,
    color: '#EEF2FF', borderColor: '#818CF8'
  };
  const xml = buildGroupShape(group, 1, 20);
  assert.ok(xml.includes('group:app'));
  assert.ok(xml.includes('Application'));
  assert.ok(xml.includes('val="EEF2FF"'));
  assert.ok(xml.includes('val="818CF8"'));
  assert.ok(xml.includes('alpha val="40000"'));  // 半透明
  assert.ok(xml.includes('anchor="t"'));         // 左上ラベル
  assert.ok(xml.includes('algn="l"'));
});

test('buildGroupShape: no border falls back to gray default', () => {
  const group = {
    id: 'g', label: 'G',
    x: 0, y: 0, w: 5, h: 5,
    color: '#EEEEEE', borderColor: null
  };
  const xml = buildGroupShape(group, 1, 20);
  assert.ok(xml.includes('<a:ln>'));  // border defaults to something
});
