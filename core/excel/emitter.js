// StableBlock → Xlsx Drawing XML Emitter
// 仕様: core/excel/xlsx-emit-spec.md

export function pxToEmu(px) {
  return Math.trunc(px * 9525);
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

  const labelLines = String(block.label || '').split('\n');
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
