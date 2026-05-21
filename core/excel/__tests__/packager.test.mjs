import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { packageXlsx } from '../emitter.js';
import { loadTemplateFiles } from '../template-loader.mjs';

test('packageXlsx: produces a valid zip with all required entries', async () => {
  const templateFiles = loadTemplateFiles();
  const drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>`;
  const bytes = await packageXlsx(templateFiles, drawingXml);
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 100);

  const zip = await JSZip.loadAsync(bytes);
  assert.ok(zip.files['[Content_Types].xml']);
  assert.ok(zip.files['_rels/.rels']);
  assert.ok(zip.files['xl/workbook.xml']);
  assert.ok(zip.files['xl/worksheets/sheet1.xml']);
  assert.ok(zip.files['xl/drawings/drawing1.xml']);
});

test('packageXlsx: drawing1.xml contains the supplied content', async () => {
  const templateFiles = loadTemplateFiles();
  const drawingXml = `<?xml version="1.0"?><xdr:wsDr xmlns:xdr="x"/>`;
  const bytes = await packageXlsx(templateFiles, drawingXml);
  const zip = await JSZip.loadAsync(bytes);
  const content = await zip.files['xl/drawings/drawing1.xml'].async('string');
  assert.equal(content, drawingXml);
});
