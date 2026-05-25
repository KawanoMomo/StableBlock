// StableBlock → Xlsx Drawing XML Emitter
// 仕様: core/excel/xlsx-emit-spec.md
//
// JSZip dependency: injected via opts to support both Node (test) and
// browser (stableblock.html / VSCode webview) environments without requiring
// a bundler. In Node, pass { JSZip } from `import JSZip from 'jszip'`. In
// the browser, set window.JSZip via <script src="jszip.min.js"> and either
// pass it explicitly or let packageXlsx fall back to the global.

export function pxToEmu(px) {
  // Banker's rounding (round half to even) so 0.5 px -> 4762 EMU and
  // 1.5 px -> 14288 EMU (both expected by tests). This matches IEEE 754's
  // default rounding mode and avoids the asymmetric bias of round-half-up.
  const scaled = px * 9525;
  const rounded = Math.round(scaled);
  const frac = scaled - Math.floor(scaled);
  if (frac === 0.5) {
    return rounded % 2 === 0 ? rounded : rounded - 1;
  }
  return rounded;
}

export function gridToEmu(grid, gridPx) {
  return pxToEmu(grid * gridPx);
}

export function escapeXml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function normalizeColor(value, fallback = '000000') {
  if (!value || typeof value !== 'string') return fallback;
  const cleaned = value.replace(/^#/, '').toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(cleaned)) return fallback;
  return cleaned;
}

export function buildBlockShape(block, shapeId, gridPx) {
  const x = gridToEmu(block.x, gridPx);
  const y = gridToEmu(block.y, gridPx);
  const cx = gridToEmu(block.w, gridPx);
  const cy = gridToEmu(block.h, gridPx);
  const fillColor = normalizeColor(block.color, 'CCCCCC');
  const textColor = normalizeColor(block.textColor, '000000');
  const borderXml = block.borderColor
    ? `<a:ln><a:solidFill><a:srgbClr val="${normalizeColor(block.borderColor)}"/></a:solidFill></a:ln>`
    : `<a:ln><a:noFill/></a:ln>`;

  const round = Number(block.round) || 0;
  let geomXml;
  if (round > 0) {
    const adj = Math.min(round * 5000, 50000);
    geomXml = `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adj}"/></a:avLst></a:prstGeom>`;
  } else {
    geomXml = `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`;
  }

  const labelLines = String(block.label || '').split(/\\n|\r?\n/);
  const paragraphs = labelLines.map(line =>
    `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ja-JP" sz="1100"><a:solidFill><a:srgbClr val="${textColor}"/></a:solidFill></a:rPr><a:t>${escapeXml(line)}</a:t></a:r></a:p>`
  ).join('');

  return `<xdr:absoluteAnchor>` +
    `<xdr:pos x="${x}" y="${y}"/>` +
    `<xdr:ext cx="${cx}" cy="${cy}"/>` +
    `<xdr:sp macro="" textlink="">` +
      `<xdr:nvSpPr>` +
        `<xdr:cNvPr id="${shapeId}" name="block:${escapeXml(block.id)}"/>` +
        `<xdr:cNvSpPr/>` +
      `</xdr:nvSpPr>` +
      `<xdr:spPr>` +
        `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
        geomXml +
        `<a:solidFill><a:srgbClr val="${fillColor}"/></a:solidFill>` +
        borderXml +
      `</xdr:spPr>` +
      `<xdr:txBody>` +
        `<a:bodyPr wrap="square" anchor="ctr"/>` +
        `<a:lstStyle/>` +
        paragraphs +
      `</xdr:txBody>` +
    `</xdr:sp>` +
    `<xdr:clientData/>` +
  `</xdr:absoluteAnchor>`;
}

export function buildGroupShape(group, shapeId, gridPx) {
  const x = gridToEmu(group.x, gridPx);
  const y = gridToEmu(group.y, gridPx);
  const cx = gridToEmu(group.w, gridPx);
  const cy = gridToEmu(group.h, gridPx);
  const fillColor = normalizeColor(group.color, 'F3F4F6');
  const borderColor = normalizeColor(group.borderColor, '9CA3AF');

  return `<xdr:absoluteAnchor>` +
    `<xdr:pos x="${x}" y="${y}"/>` +
    `<xdr:ext cx="${cx}" cy="${cy}"/>` +
    `<xdr:sp macro="" textlink="">` +
      `<xdr:nvSpPr>` +
        `<xdr:cNvPr id="${shapeId}" name="group:${escapeXml(group.id)}"/>` +
        `<xdr:cNvSpPr/>` +
      `</xdr:nvSpPr>` +
      `<xdr:spPr>` +
        `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
        `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
        `<a:solidFill><a:srgbClr val="${fillColor}"><a:alpha val="40000"/></a:srgbClr></a:solidFill>` +
        `<a:ln><a:solidFill><a:srgbClr val="${borderColor}"/></a:solidFill></a:ln>` +
      `</xdr:spPr>` +
      `<xdr:txBody>` +
        `<a:bodyPr wrap="square" anchor="t"/>` +
        `<a:lstStyle/>` +
        `<a:p><a:pPr algn="l"/><a:r><a:rPr lang="ja-JP" sz="900" b="1"><a:solidFill><a:srgbClr val="475569"/></a:solidFill></a:rPr><a:t>${escapeXml(group.label || '')}</a:t></a:r></a:p>` +
      `</xdr:txBody>` +
    `</xdr:sp>` +
    `<xdr:clientData/>` +
  `</xdr:absoluteAnchor>`;
}

export function buildNoteShape(note, shapeId, gridPx) {
  // ノートは Block と同じ形だが name プレフィックスが note:
  const xml = buildBlockShape(note, shapeId, gridPx);
  return xml.replace(`name="block:${escapeXml(note.id)}"`, `name="note:${escapeXml(note.id)}"`);
}

export function centerOfShape(shape, gridPx) {
  const cxPx = (shape.x + shape.w / 2) * gridPx;
  const cyPx = (shape.y + shape.h / 2) * gridPx;
  return { x: pxToEmu(cxPx), y: pxToEmu(cyPx) };
}

export function computeConnectionEndpoints(conn, blockMap, gridPx) {
  const from = blockMap[conn.from];
  const to = blockMap[conn.to];
  if (!from || !to) return null;
  const c1 = centerOfShape(from, gridPx);
  const c2 = centerOfShape(to, gridPx);
  return { x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y };
}

export function buildConnectionShape(conn, connIndex, endpoints, shapeId) {
  const { x1, y1, x2, y2 } = endpoints;
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const absDx = Math.abs(x2 - x1);
  const absDy = Math.abs(y2 - y1);
  const flipH = x1 > x2 ? 'true' : 'false';
  const flipV = y1 > y2 ? 'true' : 'false';
  const lineColor = normalizeColor(conn.color, '64748B');
  const lineWidth = pxToEmu(Number(conn.width) || 1.5);
  const dashXml = conn.style === 'dashed' ? '<a:prstDash val="dash"/>' : '';
  const headEnd = conn.bidir ? '<a:headEnd type="triangle"/>' : '';

  return `<xdr:absoluteAnchor>` +
    `<xdr:pos x="${minX}" y="${minY}"/>` +
    `<xdr:ext cx="${absDx}" cy="${absDy}"/>` +
    `<xdr:cxnSp macro="">` +
      `<xdr:nvCxnSpPr>` +
        `<xdr:cNvPr id="${shapeId}" name="conn:${connIndex}"/>` +
        `<xdr:cNvCxnSpPr/>` +
      `</xdr:nvCxnSpPr>` +
      `<xdr:spPr>` +
        `<a:xfrm flipH="${flipH}" flipV="${flipV}"><a:off x="0" y="0"/><a:ext cx="${absDx}" cy="${absDy}"/></a:xfrm>` +
        `<a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom>` +
        `<a:ln w="${lineWidth}"><a:solidFill><a:srgbClr val="${lineColor}"/></a:solidFill>${dashXml}${headEnd}<a:tailEnd type="triangle"/></a:ln>` +
      `</xdr:spPr>` +
    `</xdr:cxnSp>` +
    `<xdr:clientData/>` +
  `</xdr:absoluteAnchor>`;
}

export function buildConnectionLabel(conn, connIndex, endpoints, shapeId) {
  const { x1, y1, x2, y2 } = endpoints;
  const midX = Math.round((x1 + x2) / 2);
  const midY = Math.round((y1 + y2) / 2);
  const tbW = 500000;
  const tbH = 200000;
  const posX = midX - tbW / 2;
  const posY = midY - tbH / 2;

  return `<xdr:absoluteAnchor>` +
    `<xdr:pos x="${posX}" y="${posY}"/>` +
    `<xdr:ext cx="${tbW}" cy="${tbH}"/>` +
    `<xdr:sp macro="" textlink="">` +
      `<xdr:nvSpPr>` +
        `<xdr:cNvPr id="${shapeId}" name="connlabel:${connIndex}"/>` +
        `<xdr:cNvSpPr txBox="1"/>` +
      `</xdr:nvSpPr>` +
      `<xdr:spPr>` +
        `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${tbW}" cy="${tbH}"/></a:xfrm>` +
        `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
        `<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>` +
        `<a:ln><a:noFill/></a:ln>` +
      `</xdr:spPr>` +
      `<xdr:txBody>` +
        `<a:bodyPr wrap="square" anchor="ctr"/>` +
        `<a:lstStyle/>` +
        `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ja-JP" sz="900"><a:solidFill><a:srgbClr val="64748B"/></a:solidFill></a:rPr><a:t>${escapeXml(conn.label || '')}</a:t></a:r></a:p>` +
      `</xdr:txBody>` +
    `</xdr:sp>` +
    `<xdr:clientData/>` +
  `</xdr:absoluteAnchor>`;
}

const Z_ORDER = { group: 0, connection: 1, connlabel: 2, block: 3, note: 4 };

export function sortByZOrder(items) {
  return [...items].sort((a, b) => {
    const za = Z_ORDER[a.kind] ?? 99;
    const zb = Z_ORDER[b.kind] ?? 99;
    if (za !== zb) return za - zb;
    return (a.srcIndex || 0) - (b.srcIndex || 0);
  });
}

export function buildDrawingXml(ast) {
  const gridPx = ast.canvas?.grid || 20;
  const items = [];

  (ast.groups || []).forEach((g, i) => items.push({ kind: 'group', data: g, srcIndex: i }));

  (ast.connections || []).forEach((c, i) => {
    const ep = computeConnectionEndpoints(c, ast.blockMap || {}, gridPx);
    if (!ep) {
      console.warn(`[excel-emitter] skipping connection: ${c.from} -> ${c.to} (endpoint missing)`);
      return;
    }
    items.push({ kind: 'connection', data: c, srcIndex: i, endpoints: ep, connIndex: i });
    if (c.label) {
      items.push({ kind: 'connlabel', data: c, srcIndex: i, endpoints: ep, connIndex: i });
    }
  });

  (ast.blocks || []).forEach((b, i) => items.push({ kind: 'block', data: b, srcIndex: i }));
  (ast.notes || []).forEach((n, i) => items.push({ kind: 'note', data: n, srcIndex: i }));

  const sorted = sortByZOrder(items);

  let shapeId = 1;
  const anchorXmls = sorted.map(item => {
    switch (item.kind) {
      case 'group': return buildGroupShape(item.data, shapeId++, gridPx);
      case 'connection': return buildConnectionShape(item.data, item.connIndex, item.endpoints, shapeId++);
      case 'connlabel': return buildConnectionLabel(item.data, item.connIndex, item.endpoints, shapeId++);
      case 'block': return buildBlockShape(item.data, shapeId++, gridPx);
      case 'note': return buildNoteShape(item.data, shapeId++, gridPx);
      default: return '';
    }
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"` +
    ` xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"` +
    ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    anchorXmls.join('') +
    `</xdr:wsDr>`;
}

function resolveJSZip(opts) {
  if (opts && opts.JSZip) return opts.JSZip;
  if (typeof window !== 'undefined' && window.JSZip) return window.JSZip;
  throw new Error('JSZip not available; pass via opts.JSZip in Node or load jszip.min.js in browser');
}

export async function packageXlsx(templateFiles, drawingXml, opts = {}) {
  const JSZipCls = resolveJSZip(opts);
  const zip = new JSZipCls();
  for (const [path, content] of Object.entries(templateFiles)) {
    zip.file(path, content);
  }
  zip.file('xl/drawings/drawing1.xml', drawingXml);
  return await zip.generateAsync({ type: 'uint8array' });
}

export async function renderXlsx(ast, opts = {}) {
  const templateFiles = opts.templateFiles || (await loadTemplateFilesAsync());
  const drawingXml = buildDrawingXml(ast);
  return await packageXlsx(templateFiles, drawingXml, opts);
}

async function loadTemplateFilesAsync() {
  // Node 環境では template-loader.mjs を、ブラウザでは window.StableBlockTemplateFiles を使う
  if (typeof window !== 'undefined' && window.StableBlockTemplateFiles) {
    return window.StableBlockTemplateFiles;
  }
  const mod = await import('./template-loader.mjs');
  return mod.loadTemplateFiles();
}
