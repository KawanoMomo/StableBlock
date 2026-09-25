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

// block 同士の接続(note が端の注釈線を除く)の経路。mode は接続に route が無いときの線モード
export function connectionPaths(parsed, mode) {
  const g = parsed.canvas.grid;
  const conns = parsed.connections.filter(c => !(parsed.noteMap[c.from] || parsed.noteMap[c.to]));
  const ports = computePorts(conns, parsed.blockMap, g);
  const out = [];
  conns.forEach((c, i) => {
    const p = ports[i];
    if (p) out.push({ conn: c, pts: pathPoints(p.fp, p.tp, p.fs, p.ts, c.route || mode) });
  });
  return out;
}
