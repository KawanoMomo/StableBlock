// StableBlock → Xlsx Drawing XML Emitter
// 仕様: core/excel/xlsx-emit-spec.md

export function pxToEmu(px) {
  return Math.trunc(px * 9525);
}

export function gridToEmu(grid, gridPx) {
  return pxToEmu(grid * gridPx);
}
