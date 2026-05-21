import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeXml, normalizeColor } from '../emitter.js';

test('escapeXml: basic chars', () => {
  assert.equal(escapeXml('a & b'), 'a &amp; b');
  assert.equal(escapeXml('<tag>'), '&lt;tag&gt;');
  assert.equal(escapeXml('"hi"'), '&quot;hi&quot;');
  assert.equal(escapeXml("it's"), 'it&apos;s');
});

test('escapeXml: empty and null-safe', () => {
  assert.equal(escapeXml(''), '');
  assert.equal(escapeXml(null), '');
  assert.equal(escapeXml(undefined), '');
});

test('normalizeColor: strips # and uppercases', () => {
  assert.equal(normalizeColor('#3b82f6'), '3B82F6');
  assert.equal(normalizeColor('3B82F6'), '3B82F6');
});

test('normalizeColor: falls back to default for invalid', () => {
  assert.equal(normalizeColor(null, '000000'), '000000');
  assert.equal(normalizeColor('', '000000'), '000000');
  assert.equal(normalizeColor('not-a-color', '000000'), '000000');
});
