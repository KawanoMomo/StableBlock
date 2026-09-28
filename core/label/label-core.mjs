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

// ─── ラベルの引用(.sb の "…")。中の \" が 1 文字の " を表す。ほかの \ はそのまま(\n は改行の印のまま)。
// 読む側は LABEL_Q の形で切り出して unquoteLabel、書く側は quoteLabel。パーサ(core/dsl・HTML 版・VSCode 拡張)と GUI の書き込みが同じ規則を使う
// 形: "((?:\\"|[^"])*)"。末尾が \ のラベル("C:\")は後戻りで閉じ引用符として読める
export function unquoteLabel(raw) {
  return String(raw == null ? '' : raw).replace(/\\"/g, '"');
}
export function quoteLabel(label) {
  return '"' + String(label == null ? '' : label).replace(/"/g, '\\"') + '"';
}

// 接続行のラベルを置換/挿入/除去する。replace の第2引数は $ 特殊展開を避けるため必ず関数。ラベル中の " は \" で書く
// 同じ 2 つの間に向き違いの接続があれば from → to の行を直す(無ければ逆の書き順の行。connLineIndex)
export function setConnLabelInDsl(dsl, from, to, label) {
  const clean = String(label);
  return editConnLine(dsl, from, to, line => {
    const hasLabel = /^(\s*\S+\s+(?:-->|->)\s+\S+\s*)"(?:\\"|[^"])*"/.test(line);
    if (hasLabel && clean) return line.replace(/^(\s*\S+\s+(?:-->|->)\s+\S+\s*)"(?:\\"|[^"])*"/, (_, head) => head + quoteLabel(clean));
    if (hasLabel) return line.replace(/^(\s*\S+\s+(?:-->|->)\s+\S+)\s*"(?:\\"|[^"])*"/, (_, head) => head);
    if (clean) return line.replace(/^(\s*\S+\s+(?:-->|->)\s+\S+)/, (_, head) => head + ' ' + quoteLabel(clean));
    return line;
  });
}

// ── 同じ 2 つの間の向き違いの接続(BLK-owner-20260928-2255-2) ──
// 行き(A -> B "req")と戻り(B -> A "notify")は別の接続。双方向(A --> B)は両方の向きを持つ。
// 接続パネルは 2 つの間の接続を向きごとに並べ、各行の編集はその向きの行だけを直す(HTML 版・VSCode 拡張共用)。

// connections(parse 済み)に from → to の向きの接続があるか(双方向は逆の書き順でも持つ)
export function hasConnDir(connections, from, to) {
  return (connections || []).some(c => (c.from === from && c.to === to) || (c.bidir && c.from === to && c.to === from));
}

// 2 つの間の接続を向きを問わず全部(本文の順)
export function connsBetween(connections, a, b) {
  return (connections || []).filter(c => (c.from === a && c.to === b) || (c.from === b && c.to === a));
}

// 本文の行のうち from → to の接続の行番号(0 始まり)。向きが一致する行を先に探し、無ければ逆の書き順の行。無ければ -1
export function connLineIndex(lines, from, to) {
  let rev = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = String(lines[i]).trim().match(/^(\S+)\s+(-->|->)\s+(\S+)/);
    if (!m) continue;
    if (m[1] === from && m[3] === to) return i;
    if (rev < 0 && m[1] === to && m[3] === from) rev = i;
  }
  return rev;
}

// from → to の行を fn(行) で置き換える。fn が null を返せば行を消す。行が無ければ本文はそのまま
function editConnLine(dsl, from, to, fn) {
  const lines = String(dsl).split('\n');
  const i = connLineIndex(lines, from, to);
  if (i < 0) return dsl;
  const next = fn(lines[i]);
  if (next === null) lines.splice(i, 1); else lines[i] = next;
  return lines.join('\n');
}

// 反転・双方向化で同じ向きが 2 本にならないか。逆向きの片方向が別にあれば false(パネルはそのボタンを押せなくする)
export function canFlipConn(connections, from, to) {
  const list = connections || [];
  const c = list.find(x => x.from === from && x.to === to);
  return !!c && (c.bidir || !list.some(x => x !== c && x.from === to && x.to === from));
}

export function flipConnInDsl(dsl, from, to) {
  return editConnLine(dsl, from, to, line => line.replace(/^(\s*)(\S+)(\s+)(-->|->)(\s+)(\S+)/, (_, sp, f, s1, ar, s2, t) => sp + t + s1 + ar + s2 + f));
}

export function toggleBidirInDsl(dsl, from, to) {
  return editConnLine(dsl, from, to, line => line.replace(/^(\s*\S+\s+)(-->|->)/, (_, head, ar) => head + (ar === '-->' ? '->' : '-->')));
}

// 属性(color / width / style / route / lpos …)を置き換えるか末尾に足す
export function setConnPropInDsl(dsl, from, to, prop, val) {
  const re = new RegExp(prop + '=\\S+');
  return editConnLine(dsl, from, to, line => re.test(line) ? line.replace(re, () => `${prop}=${val}`) : line.trimEnd() + ` ${prop}=${val}`);
}

export function removeConnPropInDsl(dsl, from, to, prop) {
  const re = new RegExp('\\s*' + prop + '=\\S+');
  return editConnLine(dsl, from, to, line => line.replace(re, ''));
}

// from → to の行だけを消す(逆向きの接続は残す)
export function removeConnInDsl(dsl, from, to) {
  return editConnLine(dsl, from, to, () => null);
}

// 選んだ順の ID を鎖状に結ぶ(a -> b、b -> c …。Mermaid の a --> b --> c と同じ)。本文の末尾に接続の行を本数ぶん足すだけ。
// connections(parse 済み)に同じ向きの接続(双方向を含む)が既にあれば足さない。逆向きしか無ければ足す(行きと戻りを別の線にする)。
// 返り値 { dsl, added: [{ from, to }] }
export function chainConnectInDsl(dsl, ids, connections) {
  const added = [];
  for (let i = 0; i + 1 < (ids || []).length; i++) {
    const from = ids[i], to = ids[i + 1];
    if (from === to || hasConnDir(connections, from, to) || added.some(c => c.from === from && c.to === to)) continue;
    added.push({ from, to });
  }
  if (!added.length) return { dsl, added };
  return { dsl: dsl.trimEnd() + '\n' + added.map(c => `${c.from} -> ${c.to}`).join('\n') + '\n', added };
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

// プロパティ欄の ID 欄を開いて見せるか。ID はラベルを打てば自動で付くので普段は畳んで今の ID だけを見せ、まだ名前が無い
// (`__new_` で始まる)とき、一緒に読み込んだほかの図でも使われている(elsewhere。改名が全部の図に及ぶと見せる)とき、
// 利用者が開いたままにしたとき(userOpen)だけ開く。改名はこの欄から(参照も一緒に変わる)
export function idFieldOpen(id, userOpen, elsewhere) {
  return !!userOpen || !!elsewhere || isPlaceholderId(id);
}

// 追加したばかりでまだ名前の無い要素の仮の ID(`__new_N`)か。ラベルを確定した時点でこれが残っていれば、ラベルから ID を
// 作れていない(英数字の無いラベル)ので、GUI は ID 欄へ移って名前を聞く(HTML 版・VSCode 拡張)
export function isPlaceholderId(id) {
  return typeof id === 'string' && id.startsWith('__new_');
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
// ラベル・属性・コメントの中の同じ文字列には触れない(ラベル全体が旧 ID と同じ文字列のときだけ新 ID に揃える)。同じ ID の定義が他に残るとき(重複 ID)は接続行を書き換えない。
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
  // ラベルが ID と同じ文字列(ID をそのまま表示名にしている)なら、表示名も新しい ID に揃える(ID と表示名の食い違いを作らない)
  lines[target] = lines[target].replace(/^(\s*(?:block|group|note)\s+\S+\s+)"((?:\\"|[^"])*)"/, (all, head, label) => (unquoteLabel(label) === oldId ? `${head}"${newId}"` : all));
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

// ツールバーの「ID補正」: 仮の ID(`__new_N`)のままの要素に、ラベルから ID を一括で付ける(表記はラベルのまま。重なれば `_2`)。
// items は [{ id, label, line }](line は本文の定義行、1 始まり)、used は図で使っている ID 全部(include 先を含む)。
// 仮の ID でない要素には触れない。ラベルに英数字が無く ID を作れない要素は left に返す(ID 欄で付ける)
export function fixPlaceholderIdsInDsl(dsl, items, used) {
  const taken = new Set(used instanceof Set ? used : Array.from(used || []));
  const renamed = [], left = [];
  let out = dsl;
  for (const it of items || []) {
    if (!isPlaceholderId(it.id)) continue;
    const base = labelToId(it.label);
    if (!base) { left.push(it); continue; }
    const to = uniqueId(base, taken);
    const next = renameIdInDsl(out, it.id, to, it.line);
    if (next === out) { left.push(it); continue; }
    out = next;
    taken.add(to);
    renamed.push({ from: it.id, to, line: it.line });
  }
  return { dsl: out, renamed, left };
}

// ─── 図をまたぐ ID の参照探しと改名(CLI `npm run check -- --refs / --rename` と VSCode 拡張の F2 が共用) ───
// 書き換えるのは定義行の ID(ラベル全体が旧 ID と同じ文字列ならそのラベルも新 ID に揃える)と接続行の from / to だけ。
// ラベルの一部に旧 ID を含むだけのとき・属性・コメント・座標の行は 1 バイトも変えない。

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

// 一緒に読み込んだ複数の図(files: [{ path, text }])から、ID かラベルに query を含む定義行と、from / to に含む接続行を探す(大文字小文字を区別しない)。
// 戻り値 [{ path, line(1 始まり), kind: 'def' | 'ref', id, text(行末の \r を除く) }]。HTML 版のツールバーの検索が、表示中でない図の当たりを並べるのに使う
export function searchIdsInFiles(files, query) {
  const q = String(query == null ? '' : query).trim().toLowerCase();
  if (!q) return [];
  const out = [];
  for (const f of files) {
    String(f.text).split('\n').forEach((raw, i) => {
      const text = raw.replace(/\r$/, '');
      const d = text.match(ID_DEF_RE);
      if (d) {
        const lm = text.slice(d[0].length).match(/^\s*"((?:\\"|[^"])*)"/);
        if (d[2].toLowerCase().includes(q) || (lm && unquoteLabel(lm[1]).toLowerCase().includes(q))) out.push({ path: f.path, line: i + 1, kind: 'def', id: d[2], text });
        return;
      }
      const c = text.match(ID_CONN_RE);
      if (!c) return;
      const id = [c[2], c[6]].find(x => x.toLowerCase().includes(q));
      if (id) out.push({ path: f.path, line: i + 1, kind: 'ref', id, text });
    });
  }
  return out;
}

// 一緒に読み込んだ図のパス(paths)のうち、パスに query を含む図(大文字小文字を区別しない)。名前(最後の / か \ の後)の先頭で当たる図、
// 名前に含む図、フォルダ名だけで当たる図の順で、同じ順位の中は paths の順。HTML 版のツールバーの検索が、図名で当たった図を一覧の先頭に出すのに使う
export function searchFileNames(paths, query) {
  const q = String(query == null ? '' : query).trim().toLowerCase();
  if (!q) return [];
  const rank = p => {
    const s = String(p).toLowerCase(), b = s.split(/[\\/]/).pop();
    return b.startsWith(q) ? 0 : b.includes(q) ? 1 : s.includes(q) ? 2 : -1;
  };
  return paths.map((p, i) => ({ p, i, r: rank(p) })).filter(x => x.r >= 0).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.p);
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

// 表示名を図をまたいで揃える(HTML 版のラベル欄 / キャンバス上のラベル編集で Enter)。同じ ID は図をまたいで同じ部品なので、
// ほかの図の id の定義行のうち、ラベルが oldLabel と同じもの(unquote 後の文字列で比べる)だけを newLabel にする。違うラベルを付けている図と、
// 定義行のラベルより後ろ(座標・属性)と、接続行・コメントは 1 バイトも変えない。ラベルは DSL の書き方(note の改行は \n のまま)で渡す。
// 戻り値: { changes: [{ path, text(書換後の全文), lines: [{ line, before, after }] }] }(変わった図だけ)
const LABEL_DEF_RE = /^(\s*(?:block|group|note)\s+)(\S+)(\s+)"((?:\\"|[^"])*)"/;
export function relabelIdInDsl(dsl, id, oldLabel, newLabel) {
  if (oldLabel === newLabel) return dsl;
  const lines = String(dsl).split('\n');
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(LABEL_DEF_RE);
    if (!m || m[2] !== id || unquoteLabel(m[4]) !== oldLabel) continue;
    lines[i] = m[1] + m[2] + m[3] + quoteLabel(newLabel) + lines[i].slice(m[0].length);
    changed = true;
  }
  return changed ? lines.join('\n') : dsl;
}
export function planRelabel(files, id, oldLabel, newLabel) {
  const changes = [];
  for (const f of files) {
    const text = relabelIdInDsl(f.text, id, oldLabel, newLabel);
    if (text === f.text) continue;
    const a = f.text.split('\n'), b = text.split('\n');
    const lines = [];
    a.forEach((l, i) => { if (l !== b[i]) lines.push({ line: i + 1, before: l.replace(/\r$/, ''), after: b[i].replace(/\r$/, '') }); });
    changes.push({ path: f.path, text, lines });
  }
  return { changes };
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
