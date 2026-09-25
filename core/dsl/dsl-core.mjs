// StableBlock DSL の parse / 直列化(node --test とコーパス往復テスト用)。
// parseDSL の意味は stableblock.html の parseDSL と同じ(ドリフトは __tests__/dsl-core.test.mjs が検出する)。
// 追加で `source`(行ごとの配置情報)を返し、serializeDSL が「parser が理解した値」を元の空白・コメント・改行で並べ直す。
// parser が黙って捨てる記法(未知の属性・値の正規化)は往復でバイトが変わるので、コーパス往復テストで見つかる。
// DOM API は使用禁止 — 純粋関数のみ。

import { parseLpos } from '../label/label-core.mjs';

const RE_BLOCK = /^block\s+(\S+)\s+"([^"]*)"\s+at\s+([\d.]+),([\d.]+)\s+size\s+([\d.]+)x([\d.]+)(.*)/d;
const RE_GROUP = /^group\s+(\S+)\s+"([^"]*)"\s+at\s+([\d.]+),([\d.]+)\s+size\s+([\d.]+)x([\d.]+)(.*)/d;
const RE_NOTE = /^note\s+(\S+)\s+"([^"]*)"\s+at\s+([\d.]+),([\d.]+)\s+size\s+([\d.]+)x([\d.]+)(.*)/d;
const RE_CONN = /^(\S+)\s+(-->|->)\s+(\S+)\s*(?:"([^"]*)")?\s*(.*)/d;
const RE_CANVAS = /^@canvas(.*)/d;

const BOX_KEYS = ['id', 'label', 'x', 'y', 'w', 'h'];
const CONN_KEYS = ['from', 'arrow', 'to', 'label'];

// [フィールド名, 属性の正規表現]。parser と同じく rest の最初の一致だけを読む
const ATTRS = {
  block: [['color', /color=(\S+)/d], ['textColor', /text=(\S+)/d], ['borderColor', /border=(\S+)/d], ['round', /round=(\d+)/d], ['style', /style=(\S+)/d]],
  group: [['color', /color=(\S+)/d], ['borderColor', /border=(\S+)/d]],
  note: [['color', /color=(\S+)/d], ['textColor', /text=(\S+)/d], ['borderColor', /border=(\S+)/d], ['round', /round=(\d+)/d], ['style', /style=(\S+)/d]],
  conn: [['color', /color=(\S+)/d], ['style', /style=(\S+)/d], ['width', /width=([\d.]+)/d], ['route', /route=(\S+)/d], ['lpos', /lpos=(\S+)/d]],
  canvas: [['width', /width=(\d+)/d], ['height', /height=(\d+)/d], ['grid', /grid=(\d+)/d], ['route', /route=(\S+)/d]],
};

function attr(rest, re) { return rest.match(re)?.[1]; }

function boxItem(type, m, ln) {
  const [, id, label, x, y, w, h, rest] = m;
  const base = { type, id, label, x: +x, y: +y, w: +w, h: +h };
  if (type === 'group') {
    return { ...base, color: attr(rest, /color=(\S+)/) || '#F3F4F6', borderColor: attr(rest, /border=(\S+)/) || '#9CA3AF', line: ln };
  }
  const dc = type === 'note' ? '#FEF3C7' : '#3B82F6', dt = type === 'note' ? '#92400E' : '#FFFFFF';
  return {
    ...base,
    color: attr(rest, /color=(\S+)/) || dc,
    textColor: attr(rest, /text=(\S+)/) || dt,
    borderColor: attr(rest, /border=(\S+)/) || null,
    round: +(attr(rest, /round=(\d+)/) || '4'),
    style: attr(rest, /style=(\S+)/) || 'solid',
    line: ln,
  };
}

// raw(前後の空白を除いた 1 行)を、固定文字列とフィールド参照 {key} の並びにする。
// restGroup 以降のうち parser が読まなかったトークンは落とす(往復で差分として現れる)
function template(raw, m, keys, restGroup, attrs) {
  const spans = [];
  keys.forEach((key, i) => { const ix = m.indices[i + 1]; if (ix) spans.push({ s: ix[0], e: ix[1], key }); });
  const restStart = m.indices[restGroup][0];
  const rest = m[restGroup];
  for (const [key, re] of attrs) {
    const am = rest.match(re);
    if (am) spans.push({ s: restStart + am.indices[1][0], e: restStart + am.indices[1][1], key });
  }
  spans.sort((a, b) => a.s - b.s);
  const used = [];
  for (const sp of spans) if (!used.length || sp.s >= used[used.length - 1].e) used.push(sp);
  const drops = [];
  const tok = /(\s*)(\S+)/g;
  let t;
  while ((t = tok.exec(rest))) {
    const s = restStart + t.index, e = s + t[0].length, ts = s + t[1].length;
    if (!used.some(sp => sp.s >= ts && sp.e <= e)) drops.push({ s, e });
  }
  const parts = [];
  let pos = 0;
  const cuts = [...used.map(u => ({ ...u, drop: false })), ...drops.map(d => ({ ...d, drop: true }))].sort((a, b) => a.s - b.s);
  for (const c of cuts) {
    if (c.s > pos) parts.push(raw.slice(pos, c.s));
    if (!c.drop) parts.push({ key: c.key });
    pos = c.e;
  }
  if (pos < raw.length) parts.push(raw.slice(pos));
  return parts;
}

export function parseDSL(text) {
  const lines = text.split('\n'), canvas = { width: 960, height: 640, grid: 20 };
  const blocks = [], groups = [], notes = [], connections = [], errors = [], blockMap = {}, groupMap = {}, noteMap = {}, allIds = {};
  const source = [];
  for (let i = 0; i < lines.length; i++) {
    const full = lines[i], raw = full.trim(), lead = full.length - full.trimStart().length;
    const rec = { lead: full.slice(0, lead), raw, tail: full.slice(lead + raw.length), item: null, parts: null };
    source.push(rec);
    if (!raw || raw.startsWith('#')) continue;
    const ln = i + 1;
    try {
      if (raw.startsWith('@canvas')) {
        const w = raw.match(/width=(\d+)/), h = raw.match(/height=(\d+)/), g = raw.match(/grid=(\d+)/), r = raw.match(/route=(\S+)/);
        if (w) canvas.width = +w[1]; if (h) canvas.height = +h[1]; if (g) canvas.grid = +g[1]; if (r) canvas.route = r[1];
        rec.item = canvas; rec.parts = template(raw, raw.match(RE_CANVAS), [], 1, ATTRS.canvas);
        continue;
      }
      if (raw.startsWith('@include')) {
        const inc = raw.match(/@include\s+"([^"]+)"/);
        if (inc) errors.push({ line: ln, msg: `@include "${inc[1]}" — use preprocessInclude() to resolve` });
        continue;
      }
      let done = false;
      for (const [type, re, list, map] of [['block', RE_BLOCK, blocks, blockMap], ['group', RE_GROUP, groups, groupMap], ['note', RE_NOTE, notes, noteMap]]) {
        const m = raw.match(re);
        if (!m) continue;
        const id = m[1];
        if (allIds[id]) errors.push({ line: ln, msg: `ID "${id}" が重複 (L${allIds[id]})` });
        allIds[id] = ln;
        const item = boxItem(type, m, ln);
        list.push(item); map[id] = item;
        rec.item = item; rec.parts = template(raw, m, BOX_KEYS, 7, ATTRS[type]);
        done = true;
        break;
      }
      if (done) continue;
      const m = raw.match(RE_CONN);
      if (m) {
        const [, from, arrow, to, label, rest] = m;
        const c = {
          from, to, label: label || '',
          color: rest?.match(/color=(\S+)/)?.[1] || '#64748B',
          style: rest?.match(/style=(\S+)/)?.[1] || 'solid',
          width: +(rest?.match(/width=([\d.]+)/)?.[1] || '1.5'),
          route: rest?.match(/route=(\S+)/)?.[1] || null,
          lpos: parseLpos(rest),
          bidir: arrow === '-->',
          line: ln,
        };
        connections.push(c);
        rec.item = c; rec.parts = template(raw, m, CONN_KEYS, 5, ATTRS.conn);
        continue;
      }
      errors.push({ line: ln, msg: raw.substring(0, 40) });
    } catch (e) { errors.push({ line: ln, msg: e.message }); }
  }
  const out = { canvas, blocks, groups, notes, connections, errors, blockMap, groupMap, noteMap };
  Object.defineProperty(out, 'source', { value: source, enumerable: false });
  return out;
}

function fieldText(item, key) {
  if (key === 'arrow') return item.bidir ? '-->' : '->';
  const v = item[key];
  return v === null || v === undefined ? '' : String(v);
}

// parseDSL の結果を .sb テキストに戻す。コメント・空行・解釈できない行は元のまま、要素の行は parser が読んだ値で組み直す
export function serializeDSL(parsed) {
  const source = parsed.source;
  if (!source) throw new Error('serializeDSL: parsed.source がない(core/dsl の parseDSL の結果を渡す)');
  return source.map(r => {
    const body = r.parts ? r.parts.map(p => (typeof p === 'string' ? p : fieldText(r.item, p.key))).join('') : r.raw;
    return r.lead + body + r.tail;
  }).join('\n');
}
