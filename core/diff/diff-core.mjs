// StableBlock の「Git の版と見比べる」(VSCode 拡張の Visual Diff)の純粋関数。
// 履歴の保管は Git が持ち、製品は選んだ版と今の本文を並べて見せるだけ。git の実行は拡張ホストが行い、ここは出力の読み取りと差分の計算だけ。
// DOM API・child_process は使用禁止 — node --test で検証する純粋関数のみ。

// `git log` に渡す引数(ファイルの改名をたどり、各版でのパスも取る)。1 版 = \x1e 区切りの 1 レコード、項目は \x1f 区切り
export const GIT_LOG_ARGS = ['log', '--follow', '--name-only', '--date=format:%Y-%m-%d %H:%M', '--format=%x1e%h%x1f%H%x1f%ad%x1f%s'];

// GIT_LOG_ARGS の出力 → [{ hash, full, date, subject, path }](新しい順)。path はその版でのリポジトリ直下からのパス(改名前は古い名前)
export function parseGitLog(stdout) {
  const out = [];
  for (const rec of String(stdout || '').split('\x1e')) {
    const lines = rec.replace(/\r/g, '').split('\n');
    const head = lines.shift();
    if (!head || !head.includes('\x1f')) continue;
    const [hash, full, date, subject] = head.split('\x1f');
    const path = lines.map(l => l.trim()).filter(Boolean).pop() || '';
    out.push({ hash, full, date, subject: subject || '', path });
  }
  return out;
}

// 版の見出し(QuickPick の 1 行と、差分画面の左の見出し)
export function versionLabel(v) {
  return v ? `${v.hash} ${v.date} ${v.subject}`.trim() : 'HEAD';
}

// 行の差分(最長共通部分列)。返り値 [{ op: ' ' | '-' | '+', text, a, b }](a / b は旧 / 新の行番号、無い側は 0)。
// 座標の行も正本の一部なので除かない。改行コードの違い(CRLF / LF)は差分にしない
export function lineDiff(oldText, newText) {
  const A = String(oldText).replace(/\r\n/g, '\n').split('\n'), B = String(newText).replace(/\r\n/g, '\n').split('\n');
  if (A.length && A[A.length - 1] === '' && B.length && B[B.length - 1] === '') { A.pop(); B.pop(); }
  const n = A.length, m = B.length;
  // 先頭・末尾の一致を先に外す(大きな図で表を小さくする)
  let s = 0;
  while (s < n && s < m && A[s] === B[s]) s++;
  let e = 0;
  while (e < n - s && e < m - s && A[n - 1 - e] === B[m - 1 - e]) e++;
  const a = A.slice(s, n - e), b = B.slice(s, m - e);
  const L = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  for (let k = 0; k < s; k++) out.push({ op: ' ', text: A[k], a: k + 1, b: k + 1 });
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { out.push({ op: ' ', text: a[i], a: s + i + 1, b: s + j + 1 }); i++; j++; }
    else if (i < a.length && (j >= b.length || L[i + 1][j] >= L[i][j + 1])) { out.push({ op: '-', text: a[i], a: s + i + 1, b: 0 }); i++; }
    else { out.push({ op: '+', text: b[j], a: 0, b: s + j + 1 }); j++; }
  }
  for (let k = 0; k < e; k++) out.push({ op: ' ', text: A[n - e + k], a: n - e + k + 1, b: m - e + k + 1 });
  return out;
}

// 行が定義・結ぶもの: block / group / note の ID、接続は「from->to」
function lineKey(text) {
  const t = String(text).trim();
  let m = t.match(/^(block|group|note)\s+(\S+)/);
  if (m) return { kind: 'item', key: m[2] };
  m = t.match(/^(\S+)\s+(-->|->)\s+(\S+)/);
  if (m && !t.startsWith('#') && !t.startsWith('@')) return { kind: 'conn', key: `${m[1]}->${m[3]}` };
  return null;
}

// 差分で変わった要素と接続。old は左(選んだ版)で消えた・変わった行の、new は右(今)で足した・変わった行のもの
export function changedMarks(ops) {
  const side = () => ({ items: [], conns: [] });
  const out = { old: side(), new: side() };
  for (const o of ops) {
    if (o.op === ' ') continue;
    const k = lineKey(o.text);
    if (!k) continue;
    const list = out[o.op === '-' ? 'old' : 'new'][k.kind === 'item' ? 'items' : 'conns'];
    if (!list.includes(k.key)) list.push(k.key);
  }
  return out;
}

// 差分画面に渡すもの: 見出し・左の見出し・左右の本文・左右の絵に使う本文・行差分・印。
// draw: { oldDraw, newDraw }(@include を展開した本文。無ければ本文のまま描く)。行差分は展開しない本文(正本)で取る。
// names: { left, right }(HTML 版の「今の図と比べる」。左に選んだ図・右に今の図の名前)。無ければ版(version)を左に出す(拡張の Visual Diff)。
// 2 つの本文に差分が無ければ same: true で、見出しに「変更なし」を足す
export function diffModel(oldText, newText, version, draw = {}, names = null) {
  const ops = lineDiff(oldText, newText);
  const label = names ? String(names.left) : versionLabel(version);
  const same = ops.every(o => o.op === ' ');
  const title = names ? `${names.left}(左) と ${names.right}(右・今の図)を比べている` : `${label} (left) vs Current (right)`;
  return {
    title: same ? `${title} — 変更なし` : title,
    left: label,
    right: names ? String(names.right) : 'Current',
    oldText: String(oldText), newText: String(newText),
    oldDraw: String(draw.oldDraw ?? oldText), newDraw: String(draw.newDraw ?? newText),
    ops,
    marks: changedMarks(ops),
    same,
    added: ops.filter(o => o.op === '+').length,
    removed: ops.filter(o => o.op === '-').length,
  };
}

// 行差分の欄(HTML 断片)。.sb の行差分をそのまま出し(座標の行も除かない)、変わっていない行は前後 2 行だけ残して「…」に畳む。
// 行は <div class="l del|add"> に左右の行番号(<span class="n">)と「- / + 本文」。差分が無ければ「差分なし」の 1 行
export function diffLinesHtml(ops) {
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const list = ops || [];
  if (!list.some(o => o.op !== ' ')) return '<div class="l none">差分なし(2 つの本文は同じ)</div>';
  const keep = list.map((o, i) => list.slice(Math.max(0, i - 2), i + 3).some(x => x.op !== ' '));
  let h = '', gap = false;
  list.forEach((o, i) => {
    if (!keep[i]) { if (!gap) h += '<div class="l none">…</div>'; gap = true; return; }
    gap = false;
    h += `<div class="l${o.op === '-' ? ' del' : o.op === '+' ? ' add' : ''}"><span class="n">${o.a || ''}</span><span class="n">${o.b || ''}</span>${esc(`${o.op} ${o.text}`)}</div>`;
  });
  return h;
}
