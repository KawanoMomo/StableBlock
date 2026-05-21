import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { buildDrawingXml, renderXlsx } from '../emitter.js';
import JSZip from 'jszip';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'fixtures');

const parser = new XMLParser({ ignoreAttributes: false, preserveOrder: false });

function normalizeXml(s) {
  // 属性順序を正規化するため、parse → serialize は使わず単純な空白正規化のみ
  return s.replace(/\s+/g, ' ').trim();
}

function basicAst() {
  return {
    canvas: { width: 400, height: 200, grid: 20 },
    blocks: [
      { id: 'ui', label: 'UI', x: 1, y: 1, w: 5, h: 3, color: '#3B82F6', textColor: '#FFFFFF', borderColor: null, round: 4, style: 'solid' },
      { id: 'core', label: 'Core', x: 10, y: 1, w: 5, h: 3, color: '#10B981', textColor: '#FFFFFF', borderColor: null, round: 4, style: 'solid' }
    ],
    groups: [], notes: [],
    connections: [
      { from: 'ui', to: 'core', label: 'request', color: '#64748B', style: 'solid', width: 1.5, bidir: false }
    ],
    blockMap: {
      ui: { x: 1, y: 1, w: 5, h: 3 },
      core: { x: 10, y: 1, w: 5, h: 3 }
    }
  };
}

test('golden: basic AST produces expected drawing.xml', () => {
  const expected = readFileSync(join(FIXTURE_DIR, 'basic.expected-drawing.xml'), 'utf8');
  const actual = buildDrawingXml(basicAst());
  assert.equal(normalizeXml(actual), normalizeXml(expected));
});

test('golden: renderXlsx produces valid xlsx zip', async () => {
  const bytes = await renderXlsx(basicAst());
  const zip = await JSZip.loadAsync(bytes);
  assert.ok(zip.files['xl/drawings/drawing1.xml']);
  const drawing = await zip.files['xl/drawings/drawing1.xml'].async('string');
  assert.ok(drawing.includes('block:ui'));
  assert.ok(drawing.includes('block:core'));
  assert.ok(drawing.includes('conn:0'));
  assert.ok(drawing.includes('connlabel:0'));
});

function withGroupAst() {
  return {
    canvas: { width: 400, height: 300, grid: 20 },
    blocks: [
      { id: 'ui', label: 'UI', x: 2, y: 3, w: 5, h: 3, color: '#3B82F6', textColor: '#FFFFFF', borderColor: null, round: 4, style: 'solid' },
      { id: 'core', label: 'Core', x: 10, y: 3, w: 5, h: 3, color: '#10B981', textColor: '#FFFFFF', borderColor: null, round: 4, style: 'solid' }
    ],
    groups: [
      { id: 'app', label: 'Application', x: 1, y: 1, w: 18, h: 8, color: '#EEF2FF', borderColor: '#818CF8' }
    ],
    notes: [],
    connections: [
      { from: 'ui', to: 'core', label: '', color: '#64748B', style: 'solid', width: 1.5, bidir: false }
    ],
    blockMap: {
      ui: { x: 2, y: 3, w: 5, h: 3 },
      core: { x: 10, y: 3, w: 5, h: 3 }
    }
  };
}

test('golden: with-group AST matches expected drawing.xml', () => {
  const expected = readFileSync(join(FIXTURE_DIR, 'with-group.expected-drawing.xml'), 'utf8');
  const actual = buildDrawingXml(withGroupAst());
  assert.equal(normalizeXml(actual), normalizeXml(expected));
});

function withNoteAst() {
  return {
    canvas: { width: 400, height: 300, grid: 20 },
    blocks: [
      { id: 'ui', label: 'UI', x: 1, y: 3, w: 5, h: 3, color: '#3B82F6', textColor: '#FFFFFF', borderColor: null, round: 4, style: 'solid' },
      { id: 'core', label: 'Core', x: 10, y: 3, w: 5, h: 3, color: '#10B981', textColor: '#FFFFFF', borderColor: null, round: 4, style: 'solid' }
    ],
    groups: [],
    notes: [
      { id: 'memo', label: '重要', x: 1, y: 1, w: 8, h: 1, color: '#FEF3C7', textColor: '#92400E', borderColor: null, round: 4, style: 'solid' }
    ],
    connections: [
      { from: 'ui', to: 'core', label: '', color: '#64748B', style: 'solid', width: 1.5, bidir: false }
    ],
    blockMap: {
      ui: { x: 1, y: 3, w: 5, h: 3 },
      core: { x: 10, y: 3, w: 5, h: 3 }
    }
  };
}

test('golden: with-note AST matches expected drawing.xml', () => {
  const expected = readFileSync(join(FIXTURE_DIR, 'with-note.expected-drawing.xml'), 'utf8');
  const actual = buildDrawingXml(withNoteAst());
  assert.equal(normalizeXml(actual), normalizeXml(expected));
});

test('golden: note appears above blocks in z-order', () => {
  const xml = buildDrawingXml(withNoteAst());
  const blockUiIdx = xml.indexOf('block:ui');
  const noteIdx = xml.indexOf('note:memo');
  assert.ok(blockUiIdx < noteIdx, `note (${noteIdx}) should come after block (${blockUiIdx})`);
});
