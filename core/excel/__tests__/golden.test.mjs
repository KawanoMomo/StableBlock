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
