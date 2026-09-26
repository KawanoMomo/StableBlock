import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { buildTemplateInline, buildEmitterBrowser, buildLabelCoreBrowser, buildSelectCoreBrowser, buildLayoutCoreBrowser, buildMermaidCoreBrowser, buildCheckCoreBrowser } from '../build-browser.mjs';

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
  // 作業ツリーが CRLF でも LF でも同じ結果にする(ほかの drift 検出と同じ norm)
  const actual = readFileSync(join(ROOT, 'template-inline.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(actual, expected,
    'template-inline.js is stale; run `npm run build:browser` and commit the result.');
});

test('template-inline.js の生成は template-skeleton/ の改行コード(CRLF / LF)に依らない', () => {
  const lf = walkDir(join(ROOT, 'template-skeleton')).map(f => ({ ...f, content: f.content.replace(/\r\n/g, '\n') }));
  const crlf = lf.map(f => ({ ...f, content: f.content.replace(/\n/g, '\r\n') }));
  assert.equal(buildTemplateInline(crlf), buildTemplateInline(lf));
  assert.doesNotMatch(buildTemplateInline(crlf), /\\r/);
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
    'sortByZOrder', 'buildDrawingXml', 'connectionSiteIndex', 'listXlsxDrops',
    'packageXlsx', 'renderXlsx'
  ];
  const m = src.match(/window\.StableBlockExcel\s*=\s*\{([^}]+)\}/);
  assert.ok(m, 'window.StableBlockExcel assignment not found');
  const namesInExport = m[1].split(',').map(s => s.trim()).filter(Boolean);
  for (const name of required) {
    assert.ok(namesInExport.includes(name), `missing in export object: ${name}`);
  }
});

test('label-core.browser.js is up to date (drift detection)', () => {
  const src = readFileSync(new URL('../../label/label-core.mjs', import.meta.url), 'utf8');
  const built = readFileSync(new URL('../../label/label-core.browser.js', import.meta.url), 'utf8');
  const norm = (s) => s.replace(/\r\n/g, '\n');
  assert.equal(norm(built), norm(buildLabelCoreBrowser(norm(src))),
    'Run `npm run build:browser` to regenerate label-core.browser.js');
});

test('select-core.browser.js is up to date (drift detection)', () => {
  const src = readFileSync(new URL('../../select/select-core.mjs', import.meta.url), 'utf8');
  const built = readFileSync(new URL('../../select/select-core.browser.js', import.meta.url), 'utf8');
  const norm = (s) => s.replace(/\r\n/g, '\n');
  assert.equal(norm(built), norm(buildSelectCoreBrowser(norm(src))),
    'Run `npm run build:browser` to regenerate select-core.browser.js');
});

test('layout-core.browser.js is up to date (drift detection)', () => {
  const src = readFileSync(new URL('../../layout/layout-core.mjs', import.meta.url), 'utf8');
  const built = readFileSync(new URL('../../layout/layout-core.browser.js', import.meta.url), 'utf8');
  const norm = (s) => s.replace(/\r\n/g, '\n');
  assert.equal(norm(built), norm(buildLayoutCoreBrowser(norm(src))),
    'Run `npm run build:browser` to regenerate layout-core.browser.js');
});

test('mermaid-core.browser.js is up to date (drift detection)', () => {
  const src = readFileSync(new URL('../../mermaid/mermaid-core.mjs', import.meta.url), 'utf8');
  const built = readFileSync(new URL('../../mermaid/mermaid-core.browser.js', import.meta.url), 'utf8');
  const norm = (s) => s.replace(/\r\n/g, '\n');
  assert.equal(norm(built), norm(buildMermaidCoreBrowser(norm(src))),
    'Run `npm run build:browser` to regenerate mermaid-core.browser.js');
});

test('check-core.browser.js is up to date (drift detection)', () => {
  const src = readFileSync(new URL('../../check/check-core.mjs', import.meta.url), 'utf8');
  const built = readFileSync(new URL('../../check/check-core.browser.js', import.meta.url), 'utf8');
  const norm = (s) => s.replace(/\r\n/g, '\n');
  assert.equal(norm(built), norm(buildCheckCoreBrowser(norm(src))),
    'Run `npm run build:browser` to regenerate check-core.browser.js');
});
