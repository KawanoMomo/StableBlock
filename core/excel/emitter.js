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

// The frame of a block / note as the screen draws it (core/render の block / note の stroke と同じ):
// block: color = border= or its fill color, style=bold is 2.5px, style=dashed is dashed.
// note: color = border= or #D97706. Without style= it is the dashed annotation frame at 1px; with style= the block rules apply.
export function boxLine(item, kind) {
  if (kind === 'note') {
    if (item.style == null) return { color: item.borderColor || '#D97706', widthPx: 1, dashed: true };
    return { color: item.borderColor || '#D97706', widthPx: item.style === 'bold' ? 2.5 : 1, dashed: item.style === 'dashed' };
  }
  return { color: item.borderColor || item.color || null, widthPx: item.style === 'bold' ? 2.5 : 1, dashed: item.style === 'dashed' };
}

export function buildBlockShape(block, shapeId, gridPx, opts = {}) {
  const x = gridToEmu(block.x, gridPx);
  const y = gridToEmu(block.y, gridPx);
  const cx = gridToEmu(block.w, gridPx);
  const cy = gridToEmu(block.h, gridPx);
  const fillColor = normalizeColor(block.color, 'CCCCCC');
  const textColor = normalizeColor(block.textColor, '000000');

  // Optional fill alpha (for notes)
  const fillAlpha = opts.fillAlpha;
  const fillXml = fillAlpha != null
    ? `<a:solidFill><a:srgbClr val="${fillColor}"><a:alpha val="${fillAlpha}"/></a:srgbClr></a:solidFill>`
    : `<a:solidFill><a:srgbClr val="${fillColor}"/></a:solidFill>`;

  // Border: the same stroke as the screen (boxLine). A plain block's stroke is its own fill color, so it is left out (noFill).
  const kind = opts.namePrefix === 'note' ? 'note' : 'block';
  const line = boxLine(block, kind);
  let borderXml;
  if (kind === 'block' && !block.borderColor && line.widthPx === 1 && !line.dashed) {
    borderXml = `<a:ln><a:noFill/></a:ln>`;
  } else {
    const wAttr = line.widthPx !== 1 ? ` w="${pxToEmu(line.widthPx)}"` : '';
    const dashedXml = line.dashed ? '<a:prstDash val="dash"/>' : '';
    borderXml = `<a:ln${wAttr}><a:solidFill><a:srgbClr val="${normalizeColor(line.color)}"/></a:solidFill>${dashedXml}</a:ln>`;
  }

  const round = Number(block.round) || 0;
  let geomXml;
  if (round > 0) {
    // SVG `rx` (px) と一致させるため、短辺ピクセル長に対する比率として adj を算出
    const shortPx = Math.min(block.w, block.h) * gridPx;
    const adjFromPx = shortPx > 0 ? Math.round((round / shortPx) * 100000) : 0;
    const adj = Math.min(Math.max(adjFromPx, 0), 50000);
    geomXml = `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adj}"/></a:avLst></a:prstGeom>`;
  } else {
    geomXml = `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`;
  }

  const labelLines = String(block.label || '').split(/\\n|\r?\n/);
  const paragraphs = labelLines.map(line =>
    `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ja-JP" sz="1100"><a:solidFill><a:srgbClr val="${textColor}"/></a:solidFill><a:latin typeface="Calibri"/><a:ea typeface="Yu Gothic UI"/></a:rPr><a:t>${escapeXml(line)}</a:t></a:r></a:p>`
  ).join('');

  const namePrefix = opts.namePrefix || 'block';

  return `<xdr:absoluteAnchor>` +
    `<xdr:pos x="${x}" y="${y}"/>` +
    `<xdr:ext cx="${cx}" cy="${cy}"/>` +
    `<xdr:sp macro="" textlink="">` +
      `<xdr:nvSpPr>` +
        `<xdr:cNvPr id="${shapeId}" name="${namePrefix}:${escapeXml(block.id)}"/>` +
        `<xdr:cNvSpPr/>` +
      `</xdr:nvSpPr>` +
      `<xdr:spPr>` +
        `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
        geomXml +
        fillXml +
        borderXml +
      `</xdr:spPr>` +
      `<xdr:txBody>` +
        `<a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"><a:normAutofit/></a:bodyPr>` +
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

  const labelLines = String(group.label || '').split(/\\n|\r?\n/);
  const paragraphs = labelLines.map(line =>
    `<a:p><a:pPr algn="l"/><a:r><a:rPr lang="ja-JP" sz="900" b="1"><a:solidFill><a:srgbClr val="475569"/></a:solidFill><a:latin typeface="Calibri"/><a:ea typeface="Yu Gothic UI"/></a:rPr><a:t>${escapeXml(line)}</a:t></a:r></a:p>`
  ).join('');

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
        `<a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"/>` +
        `<a:lstStyle/>` +
        paragraphs +
      `</xdr:txBody>` +
    `</xdr:sp>` +
    `<xdr:clientData/>` +
  `</xdr:absoluteAnchor>`;
}

export function buildNoteShape(note, shapeId, gridPx) {
  return buildBlockShape(note, shapeId, gridPx, {
    namePrefix: 'note',
    fillAlpha: 70000         // ~70% (matches SVG opacity 0.7). Frame: boxLine(note, 'note')
  });
}

// ─── Connection port computation (ports the SVG renderer's ECN-006 algorithm) ──

export function centerOfShape(shape, gridPx) {
  // Kept for backward compat with tests. Returns center in EMU.
  const cxPx = (shape.x + shape.w / 2) * gridPx;
  const cyPx = (shape.y + shape.h / 2) * gridPx;
  return { x: pxToEmu(cxPx), y: pxToEmu(cyPx) };
}

// getSide: pick the from/to side pair based on largest gap between blocks
// Ported from stableblock.html L337
export function getSide(fb, tb) {
  const gapB = tb.y - (fb.y + fb.h);
  const gapT = fb.y - (tb.y + tb.h);
  const gapR = tb.x - (fb.x + fb.w);
  const gapL = fb.x - (tb.x + tb.w);
  const vBest = Math.max(gapB, gapT);
  const hBest = Math.max(gapR, gapL);
  if (vBest >= hBest) {
    return gapB >= gapT ? { fs: 'bottom', ts: 'top' } : { fs: 'top', ts: 'bottom' };
  }
  return gapR >= gapL ? { fs: 'right', ts: 'left' } : { fs: 'left', ts: 'right' };
}

// portPos: where on a block's side the port goes, given idx out of total on that side
// Returns { x, y } in PIXEL units (caller converts to EMU)
// Ported from stableblock.html L343
export function portPos(b, side, idx, total, gridPx) {
  const bx = b.x * gridPx, by = b.y * gridPx;
  const bw = b.w * gridPx, bh = b.h * gridPx;
  const pad = 0.2;
  const t = total === 1 ? 0.5 : pad + (1 - 2 * pad) * idx / (total - 1);
  if (side === 'top')    return { x: bx + bw * t, y: by };
  if (side === 'bottom') return { x: bx + bw * t, y: by + bh };
  if (side === 'left')   return { x: bx,          y: by + bh * t };
  return                       { x: bx + bw,      y: by + bh * t };  // right
}

// computeAllPorts: compute ports for ALL connections at once (needed for multi-conn distribution)
// Returns an array (same length as connections) of { fp, tp, fs, ts } in PIXEL units,
// or null for connections with missing endpoints.
// Ported from stableblock.html L349
export function computeAllPorts(connections, blockMap, gridPx) {
  const sides = connections.map(c => {
    const fb = blockMap[c.from], tb = blockMap[c.to];
    return fb && tb ? getSide(fb, tb) : null;
  });
  const sm = {};
  connections.forEach((c, i) => {
    if (!sides[i]) return;
    const fb = blockMap[c.from], tb = blockMap[c.to];
    if (!sm[c.from]) sm[c.from] = {};
    const fs = sides[i].fs;
    if (!sm[c.from][fs]) sm[c.from][fs] = [];
    sm[c.from][fs].push({ ci: i, ox: tb.x + tb.w / 2, oy: tb.y + tb.h / 2 });
    if (!sm[c.to]) sm[c.to] = {};
    const ts = sides[i].ts;
    if (!sm[c.to][ts]) sm[c.to][ts] = [];
    sm[c.to][ts].push({ ci: i, ox: fb.x + fb.w / 2, oy: fb.y + fb.h / 2 });
  });
  for (const bid in sm) {
    for (const side in sm[bid]) {
      const list = sm[bid][side];
      list.sort((a, b) => (side === 'left' || side === 'right') ? (a.oy - b.oy) : (a.ox - b.ox));
    }
  }
  return connections.map((c, i) => {
    if (!sides[i]) return null;
    const fb = blockMap[c.from], tb = blockMap[c.to];
    const fl = sm[c.from][sides[i].fs];
    const tl = sm[c.to][sides[i].ts];
    return {
      fp: portPos(fb, sides[i].fs, fl.findIndex(p => p.ci === i), fl.length, gridPx),
      tp: portPos(tb, sides[i].ts, tl.findIndex(p => p.ci === i), tl.length, gridPx),
      fs: sides[i].fs,
      ts: sides[i].ts
    };
  });
}

// Legacy single-conn API (kept for backward compatibility)
// Note: does NOT account for multi-conn distribution — use computeAllPorts for that.
export function computeConnectionEndpoints(conn, blockMap, gridPx) {
  const ports = computeAllPorts([conn], blockMap, gridPx);
  const p = ports[0];
  if (!p) return null;
  return {
    x1: pxToEmu(p.fp.x),
    y1: pxToEmu(p.fp.y),
    x2: pxToEmu(p.tp.x),
    y2: pxToEmu(p.tp.y)
  };
}

// Connection site index of the rect / roundRect presets (DrawingML cxnLst order: t, l, b, r)
const CXN_SITE = { top: 0, left: 1, bottom: 2, right: 3 };
export function connectionSiteIndex(side) {
  return CXN_SITE[side] ?? 0;
}

// 接続の線の形(画面と同じ決め方: 接続の route= → `@canvas` の route= → 曲線)。知らない値は曲線
export function xlsxRoute(conn, canvas) {
  const r = conn.route || (canvas && canvas.route);
  return r === 'straight' || r === 'ortho' ? r : 'curved';
}

// 接続線の図形(DrawingML の既定形)と置き方。端点は EMU。
// 曲線 = curvedConnector3、直角 = bentConnector3(どちらも画面と同じく辺に直角に出入りし、折れ・変曲は端点の中間)、直線 = straightConnector1。
// 既定形は左上から右向きに出て右下へ右向きに入る。上下の辺で結ぶ線は 90° 回して縦に出入りさせる(回転は図形の中心まわりで、
// flip は回す前にかかる)。anchor は画面上の外接矩形(端点の箱)、xfrm は回す前の箱(Excel は 90° 回した図形の anchor を回した後の箱として読む)。
export function connectorGeometry(endpoints, route, fs) {
  const { x1, y1, x2, y2 } = endpoints;
  const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
  const anchor = { x: Math.min(x1, x2), y: Math.min(y1, y2), cx: dx, cy: dy };
  const prst = route === 'ortho' ? 'bentConnector3' : route === 'curved' ? 'curvedConnector3' : 'straightConnector1';
  const vertical = prst !== 'straightConnector1' && (fs === 'top' || fs === 'bottom');
  if (!vertical) return { prst, rot: 0, anchor, xfrm: anchor, flipH: x1 > x2, flipV: y1 > y2 };
  // 回す前の箱: 幅 = 縦の距離、高さ = 横の距離、中心は端点の中点
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const xfrm = { x: Math.round(mx - dy / 2), y: Math.round(my - dx / 2), cx: dy, cy: dx };
  return { prst, rot: 5400000, anchor, xfrm, flipH: y1 > y2, flipV: x1 < x2 };
}

// glue: { st: { id, idx }, end: { id, idx } } — shape ids the connector is glued to, so that
// moving a shape in Excel drags the line with it. Omitted → a free line (legacy behavior).
// shape: { route, fs } — the line shape as the screen draws it (connectorGeometry). Omitted → a straight line.
export function buildConnectionShape(conn, connIndex, endpoints, shapeId, glue, shape) {
  const glueXml = glue
    ? (glue.st ? `<a:stCxn id="${glue.st.id}" idx="${glue.st.idx}"/>` : '') +
      (glue.end ? `<a:endCxn id="${glue.end.id}" idx="${glue.end.idx}"/>` : '')
    : '';
  const geo = connectorGeometry(endpoints, shape ? shape.route : 'straight', shape && shape.fs);
  const rotAttr = geo.rot ? ` rot="${geo.rot}"` : '';
  const lineColor = normalizeColor(conn.color, '64748B');
  const lineWidth = pxToEmu(Number(conn.width) || 1.5);
  const dashXml = conn.style === 'dashed' ? '<a:prstDash val="dash"/>' : '';
  const headEnd = conn.bidir ? '<a:headEnd type="triangle"/>' : '';

  return `<xdr:absoluteAnchor>` +
    `<xdr:pos x="${geo.anchor.x}" y="${geo.anchor.y}"/>` +
    `<xdr:ext cx="${geo.anchor.cx}" cy="${geo.anchor.cy}"/>` +
    `<xdr:cxnSp macro="">` +
      `<xdr:nvCxnSpPr>` +
        `<xdr:cNvPr id="${shapeId}" name="conn:${connIndex}"/>` +
        (glueXml ? `<xdr:cNvCxnSpPr>${glueXml}</xdr:cNvCxnSpPr>` : `<xdr:cNvCxnSpPr/>`) +
      `</xdr:nvCxnSpPr>` +
      `<xdr:spPr>` +
        `<a:xfrm${rotAttr} flipH="${geo.flipH}" flipV="${geo.flipV}"><a:off x="${geo.xfrm.x}" y="${geo.xfrm.y}"/><a:ext cx="${geo.xfrm.cx}" cy="${geo.xfrm.cy}"/></a:xfrm>` +
        `<a:prstGeom prst="${geo.prst}"><a:avLst/></a:prstGeom>` +
        `<a:ln w="${lineWidth}"><a:solidFill><a:srgbClr val="${lineColor}"/></a:solidFill>${dashXml}${headEnd}<a:tailEnd type="triangle"/></a:ln>` +
      `</xdr:spPr>` +
    `</xdr:cxnSp>` +
    `<xdr:clientData/>` +
  `</xdr:absoluteAnchor>`;
}

// 接続ラベルの白地と文字。box は画面のラベル矩形(core/label の placeLabels / labelLayout の bg と anchor。px)。
// 文字は画面と同じ 10px(7.5pt)。box が無ければ線の中点に、文字の幅の見積もり(core/label の estimateTextWidth と同じ)で置く。
// 白地は文字の幅に合わせる(固定幅にしない。長いラベルが白地からはみ出して block の名前に掛からない)
const LABEL_PAD_X = 4, LABEL_PAD_Y = 2, LABEL_FONT_PX = 10, LABEL_LINE_PX = 12;
function labelTextWidth(text, fontPx = LABEL_FONT_PX) {
  let w = 0;
  for (const ch of String(text)) w += ch.charCodeAt(0) < 0x80 ? fontPx * 0.6 : fontPx;
  return w;
}

export function buildConnectionLabel(conn, connIndex, endpoints, shapeId, box) {
  const labelLines = String(conn.label || '').split(/\\n|\r?\n/);
  let bx, by, bw, bh, anchor;
  if (box) ({ x: bx, y: by, w: bw, h: bh, anchor } = box);
  else {
    const { x1, y1, x2, y2 } = endpoints;
    bw = Math.max(...labelLines.map(l => labelTextWidth(l))) + LABEL_PAD_X * 2;
    bh = LABEL_FONT_PX + LABEL_PAD_Y * 2;
    bx = (x1 + x2) / 2 / 9525 - bw / 2;
    by = (y1 + y2) / 2 / 9525 - bh / 2;
    anchor = 'middle';
  }
  if (labelLines.length > 1) { const cy = by + bh / 2; bh += (labelLines.length - 1) * LABEL_LINE_PX; by = cy - bh / 2; }   // 複数行は行の分だけ伸ばす(中心は同じ)
  const posX = pxToEmu(bx), posY = pxToEmu(by), tbW = pxToEmu(bw), tbH = pxToEmu(bh);
  const algn = anchor === 'start' ? 'l' : anchor === 'end' ? 'r' : 'ctr';
  const pad = pxToEmu(LABEL_PAD_X);
  const ins = `lIns="${algn === 'l' ? pad : 0}" tIns="0" rIns="${algn === 'r' ? pad : 0}" bIns="0"`;
  const paragraphs = labelLines.map(line =>
    `<a:p><a:pPr algn="${algn}"/><a:r><a:rPr lang="ja-JP" sz="750"><a:solidFill><a:srgbClr val="64748B"/></a:solidFill><a:latin typeface="Calibri"/><a:ea typeface="Yu Gothic UI"/></a:rPr><a:t>${escapeXml(line)}</a:t></a:r></a:p>`
  ).join('');

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
        `<a:bodyPr wrap="none" ${ins} anchor="ctr"/>` +
        `<a:lstStyle/>` +
        paragraphs +
      `</xdr:txBody>` +
    `</xdr:sp>` +
    `<xdr:clientData/>` +
  `</xdr:absoluteAnchor>`;
}

// 接続ラベルは block より上(block に隠れないように)。note は注釈の層として最前面
const Z_ORDER = { group: 0, connection: 1, block: 2, connlabel: 3, note: 4 };

export function sortByZOrder(items) {
  return [...items].sort((a, b) => {
    const za = Z_ORDER[a.kind] ?? 99;
    const zb = Z_ORDER[b.kind] ?? 99;
    if (za !== zb) return za - zb;
    return (a.srcIndex || 0) - (b.srcIndex || 0);
  });
}

// opts.L: core/label(browser は window.StableBlockLabel)、opts.measure: ラベルの文字幅(px)。渡すと接続ラベルを画面と同じ所に置く
// (lpos= が無ければ block の名前・他のラベルを避けた位置)。渡さなければ線の中点に置く
export function buildDrawingXml(ast, opts = {}) {
  const gridPx = ast.canvas?.grid || 20;
  const items = [];

  (ast.groups || []).forEach((g, i) => items.push({ kind: 'group', data: g, srcIndex: i }));

  // Pre-compute all connection ports together (multi-conn distribution requires it).
  // Block-to-block connections and connections touching a note (annotation, drawn dashed) are
  // distributed separately, as the SVG renderer does.
  const conns = ast.connections || [];
  const noteMap = ast.noteMap || {};
  const isAnno = c => !!(noteMap[c.from] || noteMap[c.to]);
  const allPorts = computeAllPorts(conns.map(c => (isAnno(c) ? { ...c, from: '\0', to: '\0' } : c)), ast.blockMap || {}, gridPx);
  const annoIdx = conns.map((c, i) => i).filter(i => isAnno(conns[i]));
  const annoPorts = computeAllPorts(annoIdx.map(i => conns[i]), { ...(ast.blockMap || {}), ...noteMap }, gridPx);
  annoIdx.forEach((ci, k) => { allPorts[ci] = annoPorts[k]; });
  conns.forEach((c, i) => {
    const port = allPorts[i];
    if (!port) return;   // endpoint missing — listed by listXlsxDrops()
    const ep = {
      x1: pxToEmu(port.fp.x),
      y1: pxToEmu(port.fp.y),
      x2: pxToEmu(port.tp.x),
      y2: pxToEmu(port.tp.y)
    };
    const data = isAnno(c) ? { ...c, style: 'dashed' } : c;
    items.push({ kind: 'connection', data, srcIndex: i, endpoints: ep, connIndex: i, sides: { fs: port.fs, ts: port.ts } });
    if (c.label) {
      items.push({ kind: 'connlabel', data: c, srcIndex: i, endpoints: ep, connIndex: i });
    }
  });
  // 接続ラベルの置き場所: 画面(core/render)と同じく、block 同士の線は placeLabels(本文の順に避けて置く)、注釈線は labelLayout
  const labelBox = {};
  const L = opts.L;
  if (L) {
    const measure = opts.measure || (t => L.estimateTextWidth(t, LABEL_FONT_PX));
    const midOf = i => { const p = allPorts[i]; return L.connPathInfo(p.fp, p.tp, p.fs, p.ts, xlsxRoute(conns[i], ast.canvas)).mid; };
    const normal = conns.map((c, i) => i).filter(i => conns[i].label && allPorts[i] && !isAnno(conns[i]));
    const placed = L.placeLabels(normal.map(i => ({ conn: conns[i], mid: midOf(i) })), ast, measure);
    placed.forEach((LL, k) => { labelBox[normal[k]] = { ...LL.bg, anchor: LL.anchor }; });
    for (const i of annoIdx) {
      if (!conns[i].label || !allPorts[i]) continue;
      const LL = L.labelLayout(midOf(i), conns[i].lpos, measure(conns[i].label));
      labelBox[i] = { ...LL.bg, anchor: LL.anchor };
    }
  }

  (ast.blocks || []).forEach((b, i) => items.push({ kind: 'block', data: b, srcIndex: i }));
  (ast.notes || []).forEach((n, i) => items.push({ kind: 'note', data: n, srcIndex: i }));

  const sorted = sortByZOrder(items);

  // Shape ids follow the z-order; connectors are written before the shapes they glue to,
  // so the ids of blocks / notes are assigned up front. Ids start at 2 as Excel's own drawings do: Excel renumbers a drawing
  // whose ids start at 1 without following stCxn / endCxn, and the lines end up glued to the wrong shapes.
  const FIRST_ID = 2;
  const idOf = {};
  sorted.forEach((item, k) => { if (item.kind === 'block' || item.kind === 'note') idOf[item.data.id] = k + FIRST_ID; });
  const glueOf = item => {
    const c = item.data;
    const st = idOf[c.from] != null ? { id: idOf[c.from], idx: connectionSiteIndex(item.sides.fs) } : null;
    const end = idOf[c.to] != null ? { id: idOf[c.to], idx: connectionSiteIndex(item.sides.ts) } : null;
    return st || end ? { st, end } : undefined;
  };

  let shapeId = FIRST_ID;
  const anchorXmls = sorted.map(item => {
    switch (item.kind) {
      case 'group': return buildGroupShape(item.data, shapeId++, gridPx);
      case 'connection': return buildConnectionShape(item.data, item.connIndex, item.endpoints, shapeId++, glueOf(item), { route: xlsxRoute(item.data, ast.canvas), fs: item.sides.fs });
      case 'connlabel': return buildConnectionLabel(item.data, item.connIndex, item.endpoints, shapeId++, labelBox[item.connIndex]);
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

// What the Excel output cannot carry, one line each (the UI shows it to the user after the export).
// 当て方は属性ごとに決める: 載せる(色・枠・太線/破線・角丸・線の色/太さ/破線・双方向・線の形)か、ここで知らせるか。
// どちらでもない属性は core/dsl/__tests__/export-fidelity.test.mjs が赤にする(parser の属性を足したら当て方も決める)。
// - 端が図に無い接続は描かない
// - 接続ラベルの位置 lpos= は載せる(renderXlsx に opts.L を渡すと画面と同じ所に置く)ので知らせない
export function listXlsxDrops(ast) {
  const known = { ...(ast.blockMap || {}), ...(ast.noteMap || {}) };
  const dropped = [];
  for (const c of ast.connections || []) {
    const name = `接続 ${c.from} ${c.bidir ? '-->' : '->'} ${c.to}`;
    const miss = [c.from, c.to].filter(x => !known[x]);
    if (miss.length) { dropped.push(`${name}(${miss.join(', ')} が図に無い)`); continue; }
  }
  return dropped;
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
  const drawingXml = buildDrawingXml(ast, opts);
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
