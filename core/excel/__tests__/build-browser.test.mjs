import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { buildTemplateInline, buildEmitterBrowser } from '../build-browser.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function walkDir(rootDir) {
  const out = [];
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) walk(full);
      else out.push({
        relativePath: relative(rootDir, full).split(sep).join('/'),
        content: readFileSync(full, 'utf8')
      });
    }
  }
  walk(rootDir);
  out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return out;
}

test('template-inline.js is up to date with template-skeleton/', () => {
  const skeleton = walkDir(join(ROOT, 'template-skeleton'));
  const expected = buildTemplateInline(skeleton);
  const actual = readFileSync(join(ROOT, 'template-inline.js'), 'utf8');
  assert.equal(actual, expected,
    'template-inline.js is stale; run `npm run build:browser` and commit the result.');
});

test('emitter.browser.js is up to date with emitter.js', () => {
  const emitterSource = readFileSync(join(ROOT, 'emitter.js'), 'utf8');
  const expected = buildEmitterBrowser(emitterSource);
  const actual = readFileSync(join(ROOT, 'emitter.browser.js'), 'utf8');
  assert.equal(actual, expected,
    'emitter.browser.js is stale; run `npm run build:browser` and commit the result.');
});

test('emitter.browser.js has no remaining `export` keyword', () => {
  const src = readFileSync(join(ROOT, 'emitter.browser.js'), 'utf8');
  const lines = src.split('\n').filter(l => /^\s*export\s+/.test(l));
  assert.equal(lines.length, 0, 'export keyword found in generated file: ' + lines.join('\n'));
});

test('emitter.browser.js sets window.StableBlockExcel with all expected functions', () => {
  const src = readFileSync(join(ROOT, 'emitter.browser.js'), 'utf8');
  const required = [
    'pxToEmu', 'gridToEmu', 'escapeXml', 'normalizeColor',
    'buildBlockShape', 'buildGroupShape', 'buildNoteShape',
    'centerOfShape', 'computeConnectionEndpoints',
    'buildConnectionShape', 'buildConnectionLabel',
    'sortByZOrder', 'buildDrawingXml',
    'packageXlsx', 'renderXlsx'
  ];
  const m = src.match(/window\.StableBlockExcel\s*=\s*\{([^}]+)\}/);
  assert.ok(m, 'window.StableBlockExcel assignment not found');
  const namesInExport = m[1].split(',').map(s => s.trim()).filter(Boolean);
  for (const name of required) {
    assert.ok(namesInExport.includes(name), `missing in export object: ${name}`);
  }
});
