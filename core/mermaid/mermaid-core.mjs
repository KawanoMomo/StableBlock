// StableBlock → Mermaid flowchart の書き出し(HTML版 / VSCode拡張 Webview 共用)。
// browser 版は core/excel/build-browser.mjs が mermaid-core.browser.js を生成する
// (window.StableBlockMermaid)。DOM API は使用禁止 — node --test で検証する純粋関数のみ。
//
// 方針: Mermaid の記法で表せるものは残し、表せないものは `dropped` に 1 件 1 行で返す(呼び出し側が利用者に示す)。
// - block → ノード(round>0 は角丸)。色・枠・文字色・破線/太線は `style` 行
// - group → subgraph(入れ子は包含で決める。空の group も残す)。色は `style` 行
// - note → 旗形のノード(`id>"…"]`)。色は `style` 行。note とつなぐ接続は点線
// - 接続 → `-->` / `<-->`(DSL の `-->` は双方向)、破線は `-.->`、ラベルは `|"…"|`、色・太さは `linkStyle` 行
// - 表せないもの: 座標・大きさ(Mermaid の自動配置になる)、接続の経路 route= とラベル位置 lpos=、存在しない ID への接続

const MMD_RESERVED = new Set(['end', 'graph', 'subgraph', 'flowchart', 'style', 'class', 'classdef', 'click', 'linkstyle', 'direction', 'default', 'call', 'href']);

function mmdInside(c, p) { return c.x >= p.x && c.y >= p.y && c.x + c.w <= p.x + p.w && c.y + c.h <= p.y + p.h; }

// Mermaid のラベル文字列(二重引用符の中)。DSL の `\n` は改行
export function mermaidLabel(s) {
  return String(s || '')
    .replace(/#/g, '#35;').replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;')
    .replace(/\\n/g, '<br/>');
}

// DSL の ID を Mermaid で使える ID にする。変えたものは renamed に [元, 新] で積む
export function mermaidIds(ids) {
  const out = {}, used = new Set(), renamed = [];
  for (const id of ids) if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(id) && !MMD_RESERVED.has(id.toLowerCase())) { out[id] = id; used.add(id); }
  for (const id of ids) {
    if (out[id]) continue;
    const base = 'sb_' + id.replace(/[^A-Za-z0-9_]/g, '_');
    let cand = base, n = 2;
    while (used.has(cand)) cand = `${base}_${n++}`;
    out[id] = cand; used.add(cand); renamed.push([id, cand]);
  }
  return { map: out, renamed };
}

function mmdStyle(item, kind) {
  const p = [];
  if (item.color) p.push(`fill:${item.color}`);
  const stroke = item.borderColor || (kind === 'note' ? '#D97706' : kind === 'block' ? item.color : null);
  if (stroke) p.push(`stroke:${stroke}`);
  if (item.textColor) p.push(`color:${item.textColor}`);
  if (kind === 'note' || item.style === 'dashed') p.push('stroke-dasharray:5 3');
  if (item.style === 'bold') p.push('stroke-width:2.5px');
  return p.join(',');
}

// parsed: parseDSL の結果。返り値 { text, dropped: string[] }
export function toMermaid(parsed) {
  const blocks = parsed.blocks || [], groups = parsed.groups || [], notes = parsed.notes || [], conns = parsed.connections || [];
  const { map: mid, renamed } = mermaidIds([...groups, ...blocks, ...notes].map(x => x.id));
  const dropped = [];

  // 包含で親 group を決める(自分を除く、最も小さい group)
  const parentOf = new Map();
  const area = g => g.w * g.h;
  for (const it of [...groups, ...blocks, ...notes]) {
    let best = null;
    for (const g of groups) {
      if (g === it || !mmdInside(it, g)) continue;
      if (it.type === 'group' && area(g) === area(it) && groups.indexOf(g) > groups.indexOf(it)) continue;   // 同じ枠の group 同士は先に書いた方が外
      if (!best || area(g) < area(best)) best = g;
    }
    parentOf.set(it, best);
  }
  const childrenOf = g => [...groups, ...blocks, ...notes].filter(x => parentOf.get(x) === g);

  const lines = ['flowchart TD'];
  const styles = [];
  const node = (it, ind) => {
    const lb = mermaidLabel(it.label);
    if (it.type === 'note') lines.push(`${ind}${mid[it.id]}>"${lb}"]`);
    else lines.push(`${ind}${mid[it.id]}${Number(it.round) > 0 ? `("${lb}")` : `["${lb}"]`}`);
    styles.push(`  style ${mid[it.id]} ${mmdStyle(it, it.type)}`);
  };
  const emit = (g, ind, seen) => {
    if (seen.has(g)) return; seen.add(g);
    lines.push(`${ind}subgraph ${mid[g.id]}["${mermaidLabel(g.label)}"]`);
    for (const ch of childrenOf(g)) ch.type === 'group' ? emit(ch, ind + '  ', seen) : node(ch, ind + '  ');
    lines.push(`${ind}end`);
    styles.push(`  style ${mid[g.id]} ${mmdStyle(g, 'group')}`);
  };
  const seen = new Set();
  for (const it of childrenOf(null)) it.type === 'group' ? emit(it, '  ', seen) : node(it, '  ');

  const known = new Set([...blocks, ...notes].map(x => x.id));
  const noteIds = new Set(notes.map(n => n.id));
  const links = [];
  let routed = 0;
  for (const c of conns) {
    if (!known.has(c.from) || !known.has(c.to)) {
      const miss = [c.from, c.to].filter(x => !known.has(x)).join(', ');
      dropped.push(`接続 ${c.from} ${c.bidir ? '-->' : '->'} ${c.to}(${miss} が図に無い)`);
      continue;
    }
    const dotted = c.style === 'dashed' || noteIds.has(c.from) || noteIds.has(c.to);
    const arrow = (c.bidir ? '<' : '') + (dotted ? '-.->' : '-->');
    const lbl = c.label ? `|"${mermaidLabel(c.label)}"|` : '';
    lines.push(`  ${mid[c.from]} ${arrow}${lbl} ${mid[c.to]}`);
    const ls = [];
    if (c.color) ls.push(`stroke:${c.color}`);
    if (c.width) ls.push(`stroke-width:${c.width}px`);
    if (ls.length) links.push(`  linkStyle ${links.length} ${ls.join(',')}`);
    else links.push(null);
    if (c.route || (c.label && c.lpos && c.lpos !== 'right')) routed++;   // lpos の既定は right
  }
  lines.push(...styles, ...links.filter(Boolean));

  if (blocks.length + groups.length + notes.length) dropped.push('座標・大きさ(Mermaid では自動配置になる)');
  if (routed) dropped.push(`接続の経路 route= とラベル位置 lpos=(${routed} 本。Mermaid では自動になる)`);
  for (const [a, b] of renamed) dropped.push(`ID ${a} は Mermaid で使えないので ${b} に置換`);
  return { text: lines.join('\n') + '\n', dropped };
}
