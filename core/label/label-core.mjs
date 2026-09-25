// StableBlock 接続線ラベルの共有ロジック(HTML版 / VSCode拡張 Webview 共用)。
// browser 版は core/excel/build-browser.mjs が label-core.browser.js を生成する
// (window.StableBlockLabel)。DOM API は使用禁止 — node --test で検証する純粋関数のみ。

export function extendPoint(p, side, d) {
  if (side === 'top') return { x: p.x, y: p.y - d };
  if (side === 'bottom') return { x: p.x, y: p.y + d };
  if (side === 'left') return { x: p.x - d, y: p.y };
  return { x: p.x + d, y: p.y };
}

export function bezierControls(fp, tp, fs, ts) {
  const dx = tp.x - fp.x, dy = tp.y - fp.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const cpd = Math.max(30, dist * 0.4);
  return { c1: extendPoint(fp, fs, cpd), c2: extendPoint(tp, ts, cpd) };
}

export function bezierMidpoint(fp, c1, c2, tp) {
  return {
    x: (fp.x + 3 * c1.x + 3 * c2.x + tp.x) / 8,
    y: (fp.y + 3 * c1.y + 3 * c2.y + tp.y) / 8,
  };
}

export function orthoPoints(fp, tp, fs, ts) {
  const gap = 20;
  const e1 = extendPoint(fp, fs, gap), e2 = extendPoint(tp, ts, gap);
  const isVF = fs === 'top' || fs === 'bottom', isVT = ts === 'top' || ts === 'bottom';
  if (isVF && isVT) {
    const my = (e1.y + e2.y) / 2;
    return [fp, e1, { x: e1.x, y: my }, { x: e2.x, y: my }, e2, tp];
  }
  if (!isVF && !isVT) {
    const mx = (e1.x + e2.x) / 2;
    return [fp, e1, { x: mx, y: e1.y }, { x: mx, y: e2.y }, e2, tp];
  }
  if (isVF && !isVT) return [fp, e1, { x: e1.x, y: e2.y }, e2, tp];
  return [fp, e1, { x: e2.x, y: e1.y }, e2, tp];
}

const LPOS_VALUES = ['right', 'left', 'top', 'bottom', 'center'];

export function parseLpos(rest) {
  const v = ((rest || '').match(/lpos=(\S+)/) || [])[1];
  return LPOS_VALUES.includes(v) ? v : 'right';
}

// 本文に lpos= が書かれているか。書かれていなければラベルの置き場所は placeLabels が選ぶ(既定)
export function hasLpos(rest) {
  return /(^|\s)lpos=/.test(rest || '');
}

// 配置定数はスペック§3/§4 の QAログ決定値。テキストは全位置 dominant-baseline=central 前提。
export function labelLayout(mid, lpos, textW) {
  const OFFSET = 10, PAD_X = 4, PAD_Y = 2, FONT_H = 10;
  let tx = mid.x, ty = mid.y, anchor = 'middle';
  if (lpos === 'right') { tx = mid.x + OFFSET; anchor = 'start'; }
  else if (lpos === 'left') { tx = mid.x - OFFSET; anchor = 'end'; }
  else if (lpos === 'top') { ty = mid.y - OFFSET; }
  else if (lpos === 'bottom') { ty = mid.y + OFFSET; }
  const w = textW + PAD_X * 2, h = FONT_H + PAD_Y * 2;
  const x = anchor === 'start' ? tx - PAD_X
    : anchor === 'end' ? tx - textW - PAD_X
    : tx - textW / 2 - PAD_X;
  return { tx, ty, anchor, bg: { x, y: ty - h / 2, w, h, rx: 2 } };
}

// 接続行のラベルを置換/挿入/除去する。replace の第2引数は $ 特殊展開を避けるため必ず関数。
export function setConnLabelInDsl(dsl, from, to, label) {
  const clean = String(label).replace(/"/g, '');
  const lines = dsl.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(/^(\S+)\s+(-->|->)\s+(\S+)/);
    if (!m) continue;
    if (!((m[1] === from && m[3] === to) || (m[1] === to && m[3] === from))) continue;
    const line = lines[i];
    const hasLabel = /^(\s*\S+\s+(?:-->|->)\s+\S+\s*)"[^"]*"/.test(line);
    if (hasLabel && clean) {
      lines[i] = line.replace(/^(\s*\S+\s+(?:-->|->)\s+\S+\s*)"[^"]*"/, (_, head) => head + '"' + clean + '"');
    } else if (hasLabel) {
      lines[i] = line.replace(/^(\s*\S+\s+(?:-->|->)\s+\S+)\s*"[^"]*"/, (_, head) => head);
    } else if (clean) {
      lines[i] = line.replace(/^(\s*\S+\s+(?:-->|->)\s+\S+)/, (_, head) => head + ' "' + clean + '"');
    }
    break;
  }
  return lines.join('\n');
}

export function polylineMidpoint(pts) {
  let total = 0;
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    segs.push(len);
    total += len;
  }
  if (total === 0) return { x: pts[0].x, y: pts[0].y };
  let half = total / 2;
  for (let i = 0; i < segs.length; i++) {
    if (half <= segs[i]) {
      const t = half / segs[i];
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * t,
      };
    }
    half -= segs[i];
  }
  return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
}

// ─── ID(block / group / note の名前) ───
// 利用者が決めた表記を保つ: 英数字と `_` だけを使い、大文字と `_` は落とさない。

// ID として使える表記か(英数字と `_` のみ)
export function isValidId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_]+$/.test(id);
}

// ラベルから ID の候補を作る。`Spi_Api` → `Spi_Api`、`App\nSWC` → `App_SWC`。使える文字が無ければ ''
export function labelToId(label) {
  let s = String(label).replace(/\n/g, ' ').replace(/[^A-Za-z0-9_\s]/g, '').trim().replace(/\s+/g, '_');
  if (s.length > 30) s = s.substring(0, 30).replace(/_+$/, '');
  return s;
}

// used(Set か配列)に無い ID を返す。重なれば `_2`, `_3` … を付ける
export function uniqueId(base, used) {
  const has = used instanceof Set ? id => used.has(id) : id => used.includes(id);
  if (!has(base)) return base;
  let n = 2;
  while (has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

// oldId を newId に改名する。書き換えるのは定義行(line: 1 始まり。省略時は最初の定義)と、接続行の from / to だけ。
// ラベル・属性・コメントの中の同じ文字列には触れない。同じ ID の定義が他に残るとき(重複 ID)は接続行を書き換えない。
export function renameIdInDsl(dsl, oldId, newId, line) {
  const lines = dsl.split('\n');
  const defRe = /^(\s*(?:block|group|note)\s+)(\S+)(\s)/;
  let target = -1;
  let others = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(defRe);
    if (!m || m[2] !== oldId) continue;
    if (target < 0 && (line == null || i === line - 1)) target = i;
    else others++;
  }
  if (target < 0) return dsl;
  lines[target] = lines[target].replace(defRe, (_, head, _id, sp) => head + newId + sp);
  if (others === 0) {
    const connRe = /^(\s*)(\S+)(\s+)(-->|->)(\s+)(\S+)/;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(connRe);
      if (!m || (m[2] !== oldId && m[6] !== oldId)) continue;
      lines[i] = lines[i].replace(connRe, (_, ind, from, s1, arrow, s2, to) =>
        ind + (from === oldId ? newId : from) + s1 + arrow + s2 + (to === oldId ? newId : to));
    }
  }
  return lines.join('\n');
}

// ─── 図をまたぐ ID の参照探しと改名(CLI `npm run check -- --refs / --rename` と VSCode 拡張の F2 が共用) ───
// 書き換えるのは定義行の ID と接続行の from / to だけ。ラベル・属性・コメント・座標の行は 1 バイトも変えない。

const ID_DEF_RE = /^(\s*(?:block|group|note)\s+)(\S+)(\s)/;
const ID_CONN_RE = /^(\s*)(\S+)(\s+)(-->|->)(\s+)(\S+)/;

// 本文の中で id を定義している行(def)と、接続の from / to に書いている行(ref)。line は 1 始まり、text は行末の \r を除く
export function findIdInDsl(dsl, id) {
  const out = [];
  String(dsl).split('\n').forEach((raw, i) => {
    const text = raw.replace(/\r$/, '');
    const d = text.match(ID_DEF_RE);
    if (d) { if (d[2] === id) out.push({ line: i + 1, kind: 'def', text }); return; }
    const c = text.match(ID_CONN_RE);
    if (c && (c[2] === id || c[6] === id)) out.push({ line: i + 1, kind: 'ref', text });
  });
  return out;
}

// 1 行の中で ID が書かれている位置(定義行の ID、接続の from / to)。[{ id, start, end }](列は 0 始まり、end は含まない)
export function idSpansInLine(text) {
  const d = text.match(ID_DEF_RE);
  if (d) return [{ id: d[2], start: d[1].length, end: d[1].length + d[2].length }];
  const c = text.match(ID_CONN_RE);
  if (!c) return [];
  const from = c[1].length, to = from + c[2].length + c[3].length + c[4].length + c[5].length;
  return [{ id: c[2], start: from, end: from + c[2].length }, { id: c[6], start: to, end: to + c[6].length }];
}

// 1 枚の本文で oldId を newId に改名する。その図が oldId を定義していれば定義行と接続(renameIdInDsl)、
// 定義していなければ(@include 先など別の図の定義を参照しているだけなら)接続の from / to だけ
export function renameIdAcrossDsl(dsl, oldId, newId) {
  const refs = findIdInDsl(dsl, oldId);
  if (refs.some(r => r.kind === 'def')) return renameIdInDsl(dsl, oldId, newId);
  if (!refs.length) return dsl;
  const lines = String(dsl).split('\n');
  for (const r of refs) {
    lines[r.line - 1] = lines[r.line - 1].replace(ID_CONN_RE, (_, ind, from, s1, arrow, s2, to) =>
      ind + (from === oldId ? newId : from) + s1 + arrow + s2 + (to === oldId ? newId : to));
  }
  return lines.join('\n');
}

// 複数の図(files: [{ path, text }])にまたがる改名の計画。書き込みは呼び出し側。
// 戻り値: { error } か { changes: [{ path, text(改名後の全文), lines: [{ line, before, after }] }], defs: 定義している図の数 }
// newId が使えない表記・どこかの図で既に定義されている・oldId がどの図にも無いときは error を返し、何も変えない
export function planRename(files, oldId, newId) {
  if (!isValidId(newId)) return { error: `「${newId}」は ID に使えない(英数字と _ だけ)` };
  if (oldId === newId) return { error: '改名前と同じ ID' };
  const taken = [];
  let defs = 0, found = 0;
  for (const f of files) {
    const hits = findIdInDsl(f.text, oldId);
    const own = hits.filter(h => h.kind === 'def');
    // 1 枚の中の重複 ID は、接続がどちらを指すか決まらない(ECN-013)ので改名しない
    if (own.length > 1) return { error: `「${oldId}」が ${f.path} で ${own.length} 回定義されている(${own.map(h => `L${h.line}`).join(', ')})。先に 1 つにする` };
    found += hits.length;
    defs += hits.some(h => h.kind === 'def') ? 1 : 0;
    for (const h of findIdInDsl(f.text, newId)) if (h.kind === 'def') taken.push(`${f.path}:${h.line}`);
  }
  if (taken.length) return { error: `「${newId}」は既に定義されている: ${taken.join(', ')}` };
  if (!found) return { error: `「${oldId}」を定義・参照している図が無い` };
  const changes = [];
  for (const f of files) {
    const text = renameIdAcrossDsl(f.text, oldId, newId);
    if (text === f.text) continue;
    const a = f.text.split('\n'), b = text.split('\n');
    const lines = [];
    a.forEach((l, i) => { if (l !== b[i]) lines.push({ line: i + 1, before: l.replace(/\r$/, ''), after: b[i].replace(/\r$/, '') }); });
    changes.push({ path: f.path, text, lines });
  }
  return { changes, defs };
}

// ─── 接続の端点(ポート)と経路の点列。描画(HTML版 / VSCode拡張)と検査(core/check)が同じ計算を使う ───
// 座標: 要素は grid 単位、戻り値は px(grid * g)。

// 2 つの要素の向き合う辺。縦の隙間が横の隙間以上なら上下で結ぶ
export function getSide(fb, tb) {
  const gapB = tb.y - (fb.y + fb.h), gapT = fb.y - (tb.y + tb.h), gapR = tb.x - (fb.x + fb.w), gapL = fb.x - (tb.x + tb.w);
  const vBest = Math.max(gapB, gapT), hBest = Math.max(gapR, gapL);
  if (vBest >= hBest) return gapB >= gapT ? { fs: 'bottom', ts: 'top' } : { fs: 'top', ts: 'bottom' };
  return gapR >= gapL ? { fs: 'right', ts: 'left' } : { fs: 'left', ts: 'right' };
}

// 辺 side の上で、total 本のうち idx 本目のポート位置
export function portPos(b, side, idx, total, g) {
  const bx = b.x * g, by = b.y * g, bw = b.w * g, bh = b.h * g, pad = 0.2;
  const t = total === 1 ? 0.5 : pad + (1 - 2 * pad) * idx / (total - 1);
  if (side === 'top') return { x: bx + bw * t, y: by };
  if (side === 'bottom') return { x: bx + bw * t, y: by + bh };
  if (side === 'left') return { x: bx, y: by + bh * t };
  return { x: bx + bw, y: by + bh * t };
}

// 接続ごとの {fp, tp, fs, ts}。同じ辺の複数ポートは相手の中心の並びで配る。端点が itemMap に無い接続は null
export function computePorts(connections, itemMap, g) {
  const sides = connections.map(c => { const fb = itemMap[c.from], tb = itemMap[c.to]; return fb && tb ? getSide(fb, tb) : null; });
  const sm = {};
  connections.forEach((c, i) => {
    if (!sides[i]) return;
    const fb = itemMap[c.from], tb = itemMap[c.to];
    const fs = sides[i].fs, ts = sides[i].ts;
    if (!sm[c.from]) sm[c.from] = {};
    if (!sm[c.from][fs]) sm[c.from][fs] = [];
    sm[c.from][fs].push({ ci: i, ox: tb.x + tb.w / 2, oy: tb.y + tb.h / 2 });
    if (!sm[c.to]) sm[c.to] = {};
    if (!sm[c.to][ts]) sm[c.to][ts] = [];
    sm[c.to][ts].push({ ci: i, ox: fb.x + fb.w / 2, oy: fb.y + fb.h / 2 });
  });
  for (const bid in sm) for (const side in sm[bid]) {
    sm[bid][side].sort((a, b) => (side === 'left' || side === 'right') ? (a.oy - b.oy) : (a.ox - b.ox));
  }
  return connections.map((c, i) => {
    if (!sides[i]) return null;
    const fb = itemMap[c.from], tb = itemMap[c.to];
    const fl = sm[c.from][sides[i].fs], tl = sm[c.to][sides[i].ts];
    return {
      fp: portPos(fb, sides[i].fs, fl.findIndex(p => p.ci === i), fl.length, g),
      tp: portPos(tb, sides[i].ts, tl.findIndex(p => p.ci === i), tl.length, g),
      fs: sides[i].fs, ts: sides[i].ts,
    };
  });
}

// 描かれる経路を折れ線で近似した点列(mode: curved / straight / ortho)。曲線は steps 分割
export function pathPoints(fp, tp, fs, ts, mode, steps = 24) {
  if (mode === 'straight') return [fp, tp];
  if (mode === 'ortho') return orthoPoints(fp, tp, fs, ts);
  const { c1, c2 } = bezierControls(fp, tp, fs, ts);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    pts.push({
      x: u * u * u * fp.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * tp.x,
      y: u * u * u * fp.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * tp.y,
    });
  }
  return pts;
}

// 描く経路の SVG path(d)とラベルを置く中点。画面・SVG・PNG で同じ形を描く(HTML版 / 拡張で共用)
export function connPathInfo(fp, tp, fs, ts, mode) {
  if (mode === 'straight') return { d: `M${fp.x},${fp.y} L${tp.x},${tp.y}`, mid: { x: (fp.x + tp.x) / 2, y: (fp.y + tp.y) / 2 } };
  if (mode === 'ortho') {
    const pts = orthoPoints(fp, tp, fs, ts);
    return { d: 'M' + pts.map(p => `${p.x},${p.y}`).join(' L'), mid: polylineMidpoint(pts) };
  }
  const { c1, c2 } = bezierControls(fp, tp, fs, ts);
  return { d: `M${fp.x},${fp.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${tp.x},${tp.y}`, mid: bezierMidpoint(fp, c1, c2, tp) };
}

// 図全体の既定の線の形(本文の `@canvas ... route=straight`)。書いていなければ・知らない値なら曲線
export function canvasRoute(canvas) {
  const r = canvas && canvas.route;
  return r === 'straight' || r === 'ortho' ? r : 'curved';
}

// 接続の線の形: 接続行の route= が先、無ければ `@canvas` 行の route=(図全体の既定)、どちらも無ければ曲線。
// GUI はこの 2 つ以外に線の形の状態を持たない
export function connRoute(c, canvas) {
  return c.route || canvasRoute(canvas);
}

// ツールバーの「線の形」(L キー)が次に書く図全体の既定: 曲線 → 直線 → 直角 → 曲線
export function nextCanvasRoute(route) {
  const order = ['curved', 'straight', 'ortho'];
  return order[(order.indexOf(canvasRoute({ route })) + 1) % order.length];
}

// block 同士の接続(note が端の注釈線を除く)の経路と、ラベルを置く中点(描画の connPathInfo と同じ)。線の形は connRoute(接続の route → `@canvas` の route)。
// mode は `@canvas` 行に route が無いときだけ使う(省略時は曲線)
export function connectionPaths(parsed, mode) {
  const g = parsed.canvas.grid;
  const conns = parsed.connections.filter(c => !(parsed.noteMap[c.from] || parsed.noteMap[c.to]));
  const ports = computePorts(conns, parsed.blockMap, g);
  const canvas = parsed.canvas.route ? parsed.canvas : { route: mode };
  const out = [];
  conns.forEach((c, i) => {
    const p = ports[i];
    if (!p) return;
    const m = connRoute(c, canvas);
    out.push({ conn: c, pts: pathPoints(p.fp, p.tp, p.fs, p.ts, m), mid: connPathInfo(p.fp, p.tp, p.fs, p.ts, m).mid });
  });
  return out;
}

// ─── 接続ラベルの置き場所。描画(HTML版 / VSCode拡張)と検査(core/check)が同じ計算を使う ───
// ラベルは block より上の層に白地で描く。本文に lpos= が無いラベルは、block・block の名前・group の見出し・note・
// 先に置いたラベル・キャンバスの外に掛からない位置を候補から選ぶ(本文・座標は変えない)。

// 文字幅の見積もり(px)。ASCII は 0.6 字幅、それ以外(全角)は 1 字幅。描画側は実測値を measure で渡せる
export function estimateTextWidth(text, fontPx = 10) {
  let w = 0;
  for (const ch of String(text)) w += ch.charCodeAt(0) < 0x80 ? fontPx * 0.6 : fontPx;
  return w;
}

function sbRectOverlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

// block の名前(ラベル)が描かれる矩形(px)。1 行 14px、文字は 11px 太字で中央揃え
export function blockTextBoxes(b, g) {
  const lines = String(b.label || '').split('\\n');   // 本文の改行は文字どおりの \n
  return lines.map((line, li) => {
    const w = estimateTextWidth(line, 11) * 1.05, h = 12;
    const cy = b.y * g + b.h * g / 2 + (li - (lines.length - 1) / 2) * 14;
    return { x: b.x * g + b.w * g / 2 - w / 2, y: cy - h / 2, w, h };
  }).filter(r => r.w > 0);
}

// ラベルが避けるもの。weight は掛かったときの重さ(block の地は軽く、名前・見出し・note は重い)
export function labelObstacles(parsed) {
  const g = parsed.canvas.grid;
  const out = [];
  for (const b of parsed.blocks || []) {
    out.push({ x: b.x * g, y: b.y * g, w: b.w * g, h: b.h * g, weight: 1, kind: 'block', item: b });
    for (const r of blockTextBoxes(b, g)) out.push({ ...r, weight: 30, kind: 'text', item: b });
  }
  for (const gr of parsed.groups || []) {
    const w = estimateTextWidth(String(gr.label || ''), 11) * 1.05;
    if (w > 0) out.push({ x: gr.x * g + 8, y: gr.y * g + 4, w, h: 13, weight: 30, kind: 'title', item: gr });
  }
  for (const n of parsed.notes || []) out.push({ x: n.x * g, y: n.y * g, w: n.w * g, h: n.h * g, weight: 30, kind: 'note', item: n });
  return out;
}

const LABEL_AUTO_ORDER = ['right', 'top', 'left', 'bottom', 'center'];

// 1 本のラベルの置き場所。auto なら候補のうち obstacles に最も掛からない位置(同じなら候補順の先)、auto でなければ lpos のまま
export function placeLabel(mid, lpos, textW, obstacles, auto, bounds) {
  const cands = auto ? [lpos || 'right', ...LABEL_AUTO_ORDER.filter(p => p !== (lpos || 'right'))] : [lpos || 'right'];
  let best = null;
  for (const p of cands) {
    const L = labelLayout(mid, p, textW);
    let cost = 0;
    for (const o of obstacles || []) cost += sbRectOverlap(L.bg, o) * (o.weight || 1);
    if (bounds) cost += (L.bg.w * L.bg.h - sbRectOverlap(L.bg, bounds)) * 30;
    if (!best || cost < best.cost) best = { ...L, lpos: p, cost };
    if (cost === 0) break;
  }
  return best;
}

// 本文に lpos= が無い接続か(parser が lposAuto を持たせる。持たない古い形は lpos が無いときだけ)
function isAutoLpos(c) {
  return c.lposAuto === true || (c.lposAuto === undefined && !c.lpos);
}

// ラベル付き接続の置き場所を本文の順に決める。items: [{ conn, mid(px) }](描画と同じ中点)。measure(text) は文字幅(px)
// 戻り値: [{ conn, mid, tx, ty, anchor, bg, lpos }]。先に置いたラベルにも掛からないように置く
export function placeLabels(items, parsed, measure) {
  const obstacles = labelObstacles(parsed);
  const bounds = { x: 0, y: 0, w: parsed.canvas.width, h: parsed.canvas.height };
  const width = measure || (t => estimateTextWidth(t, 10));
  const out = [];
  for (const { conn, mid } of items) {
    if (!conn.label || !mid) continue;
    const L = placeLabel(mid, conn.lpos, width(conn.label), obstacles, isAutoLpos(conn), bounds);
    out.push({ conn, mid, tx: L.tx, ty: L.ty, anchor: L.anchor, bg: L.bg, lpos: L.lpos });
    obstacles.push({ ...L.bg, weight: 10, kind: 'label', item: conn });
  }
  return out;
}

// 置いたラベルが読めない・読ませなくする所: block の名前に重なる / group の見出しに重なる / note の下に隠れる / 他のラベルに重なる
// 戻り値: [{ conn, kind: 'text' | 'title' | 'note' | 'label', item }](item は相手の block / group / note / 接続)
export function labelIssues(placed, parsed) {
  const MIN = 6;   // px²。これ未満の掛かりは数えない
  const obstacles = labelObstacles(parsed).filter(o => o.kind !== 'block');
  const out = [];
  placed.forEach((p, i) => {
    const seen = new Set();
    for (const o of obstacles) {
      if (seen.has(o.item) || sbRectOverlap(p.bg, o) < MIN) continue;
      seen.add(o.item);
      out.push({ conn: p.conn, kind: o.kind, item: o.item });
    }
    for (let j = 0; j < i; j++) {
      if (sbRectOverlap(p.bg, placed[j].bg) >= MIN) out.push({ conn: p.conn, kind: 'label', item: placed[j].conn });
    }
  });
  return out;
}

// ── コピー / 貼り付けで要素の間の接続も複製する(BLK-owner-20260926-0451-4) ──
const CONN_LINE = /^(\s*)(\S+)(\s+)(-->|->)(\s+)(\S+)(.*)$/;

// 本文のうち、両端とも ids に含まれる接続の行(前後の空白を除いた行のまま。ラベル・色・route などの属性を保つ)
export function connLinesAmong(dsl, ids) {
  const set = ids instanceof Set ? ids : new Set(ids || []);
  const out = [];
  for (const raw of String(dsl).split('\n')) {
    const line = raw.replace(/\r$/, '');
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(CONN_LINE);
    if (!m) continue;
    if (set.has(m[2]) && set.has(m[6])) out.push(t);
  }
  return out;
}

// 接続の行の from / to を map({ 旧 ID: 新 ID })で付け替える。両端とも map に無ければ null(貼り付けた要素の間の線だけを足す)
export function remapConnLine(line, map) {
  const m = String(line).match(CONN_LINE);
  if (!m || !(m[2] in map) || !(m[6] in map)) return null;
  return `${m[1]}${map[m[2]]}${m[3]}${m[4]}${m[5]}${map[m[6]]}${m[7]}`;
}
