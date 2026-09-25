// StableBlock のキャンバス選択の共有ロジック(HTML版 / VSCode拡張 Webview 共用)。
// browser 版は core/excel/build-browser.mjs が select-core.browser.js を生成する
// (window.StableBlockSelect)。DOM API は使用禁止 — node --test で検証する純粋関数のみ。
//
// 選択は [{type,id}] の配列。draw.io / Visio / Excel の図形と同じ規則にそろえる:
// - 押下: Shift は足す/外す。Shift なしで未選択の要素を押すと、その 1 つに置き換える。
//   選択済みの要素を押したときは、そのまま全部をドラッグできるよう選択を保つ
// - 離す: 動かさずに離した(クリック)なら、Shift なしのときは押した 1 つに置き換える
// - 本文の書換えで消えた要素は選択から落とす

function selSame(a, b) { return a.type === b.type && a.id === b.id; }
function selHas(sel, item) { return sel.some(s => selSame(s, item)); }

// mousedown で決まる選択。item = {type,id}
export function pressSelect(sel, item, shift) {
  if (shift) return selHas(sel, item) ? sel.filter(s => !selSame(s, item)) : sel.concat([{ type: item.type, id: item.id }]);
  return selHas(sel, item) ? sel.slice() : [{ type: item.type, id: item.id }];
}

// mouseup で決まる選択。moved は 1 グリッド以上動いたか
export function releaseSelect(sel, item, shift, moved) {
  if (shift || moved) return sel.slice();
  return selHas(sel, item) ? [{ type: item.type, id: item.id }] : sel.slice();
}

// parsed(parseDSL の結果)に無くなった要素を選択から落とす
export function pruneSelection(sel, parsed) {
  if (!parsed) return sel.slice();
  const maps = { block: parsed.blockMap || {}, group: parsed.groupMap || {}, note: parsed.noteMap || {} };
  return sel.filter(s => maps[s.type] && Object.prototype.hasOwnProperty.call(maps[s.type], s.id));
}

// 2 つの選択が同じ要素の並びか(再描画の要否判定用)
export function sameSelection(a, b) {
  return a.length === b.length && a.every((s, i) => selSame(s, b[i]));
}

// プロパティ欄の数値欄(X / Y / W / H)の ▲▼ が値をどれだけ変えるか。▲ は +1、▼ は -1。
// 1 つ選択でも複数選択でも同じ向き(Excel / Visio / draw.io の数値欄と同じ)。
// Y は下向きが正なので Y の ▲ は図の上では下へ動く。画面の向きで動かすのは矢印キー(arrowNudge)
export function stepDelta(button) {
  return button === 'up' ? 1 : button === 'dn' ? -1 : 0;
}

// 矢印キーの移動: 画面の向きに 1 グリッド。{ axis: 'x'|'y', d: ±1 }、矢印キーでなければ null
export function arrowNudge(key) {
  switch (key) {
    case 'ArrowLeft': return { axis: 'x', d: -1 };
    case 'ArrowRight': return { axis: 'x', d: 1 };
    case 'ArrowUp': return { axis: 'y', d: -1 };
    case 'ArrowDown': return { axis: 'y', d: 1 };
    default: return null;
  }
}
