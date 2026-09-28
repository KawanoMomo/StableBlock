import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pressSelect, releaseSelect, pruneSelection, sameSelection, stepDelta, arrowNudge, fieldKind, fieldCommit, fieldKeyAction } from '../select-core.mjs';

const A = { type: 'block', id: 'a' }, B = { type: 'block', id: 'b' }, C = { type: 'block', id: 'c' }, G = { type: 'group', id: 'g' };

test('press: 未選択の要素を押すとその 1 つに置き換わる', () => {
  assert.deepEqual(pressSelect([A, B], C, false), [C]);
});

test('press: 選択済みの要素を押してもドラッグのために選択を保つ', () => {
  assert.deepEqual(pressSelect([A, B], B, false), [A, B]);
});

test('press: Shift は足す・外す', () => {
  assert.deepEqual(pressSelect([A], B, true), [A, B]);
  assert.deepEqual(pressSelect([A, B], A, true), [B]);
});

test('release: 動かさずに離すと押した 1 つに置き換わる(結んだ後の次の組の 1 つ目)', () => {
  // 「a → b」で結んだ後は a, b が選択のまま。b を単クリックすると b だけになる
  const down = pressSelect([A, B], B, false);
  assert.deepEqual(releaseSelect(down, B, false, false), [B]);
  // そこへ Shift+クリックで c を足すと 2 個選択になる(3 個に膨らまない)
  assert.deepEqual(pressSelect([B], C, true), [B, C]);
});

test('release: ドラッグで動かしたとき・Shift のときは選択を保つ', () => {
  assert.deepEqual(releaseSelect([A, B], B, false, true), [A, B]);
  assert.deepEqual(releaseSelect([A, B], B, true, false), [A, B]);
});

test('release: Shift で外した要素を離しても選択は戻らない', () => {
  const down = pressSelect([A, B], A, true);
  assert.deepEqual(releaseSelect(down, A, true, false), [B]);
});

test('8 block に 10 本結ぶ操作列で、毎回 2 個選択の状態から結べる', () => {
  const ids = 'abcdefgh'.split('');
  const pairs = [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'], ['e', 'f'], ['f', 'g'], ['g', 'h'], ['a', 'e'], ['b', 'f'], ['c', 'g']];
  let sel = [];
  const click = (id, shift) => {
    const it = { type: 'block', id };
    sel = pressSelect(sel, it, shift);
    sel = releaseSelect(sel, it, shift, false);
  };
  for (const [x, y] of pairs) {
    click(x, false);
    click(y, true);
    assert.deepEqual(sel.map(s => s.id), [x, y]);
    // 結んだ後も 2 個選択のまま(connectTwo は選択を変えない)
  }
  assert.ok(ids.length === 8);
});

test('prune: 本文の書換えで消えた要素を選択から落とす', () => {
  const parsed = { blockMap: { a: {} }, groupMap: {}, noteMap: {} };
  assert.deepEqual(pruneSelection([A, B, G], parsed), [A]);
  // 型が変わった(block → group)ものも落とす
  assert.deepEqual(pruneSelection([{ type: 'group', id: 'a' }], parsed), []);
  // Object.prototype の名前は要素ではない
  assert.deepEqual(pruneSelection([{ type: 'block', id: 'toString' }], parsed), []);
});

test('sameSelection', () => {
  assert.equal(sameSelection([A, B], [A, B]), true);
  assert.equal(sameSelection([A, B], [B, A]), false);
  assert.equal(sameSelection([A], [A, B]), false);
});

test('stepDelta: プロパティ欄の ▲ は値を 1 増やし、▼ は 1 減らす(選択の数に依らない)', () => {
  assert.equal(stepDelta('up'), 1);
  assert.equal(stepDelta('dn'), -1);
  assert.equal(stepDelta('other'), 0);
});

test('arrowNudge: 矢印キーは画面の向きに 1 グリッド(▲▼ とは別)', () => {
  assert.deepEqual(arrowNudge('ArrowLeft'), { axis: 'x', d: -1 });
  assert.deepEqual(arrowNudge('ArrowRight'), { axis: 'x', d: 1 });
  assert.deepEqual(arrowNudge('ArrowUp'), { axis: 'y', d: -1 });
  assert.deepEqual(arrowNudge('ArrowDown'), { axis: 'y', d: 1 });
  assert.equal(arrowNudge('a'), null);
});

// プロパティ欄の数値・色の欄は打っている間は書かず、Enter・Tab・欄から出たときに 1 回だけ書く(BLK-owner-20260927-0728-1)
test('fieldCommit: 数値の欄は打っている間は書かず、確定で 2 桁以上の値を 1 回だけ書く', () => {
  assert.equal(fieldKind('x'), 'pos'); assert.equal(fieldKind('h'), 'size'); assert.equal(fieldKind('round'), 'round'); assert.equal(fieldKind('border'), 'color');
  assert.equal(fieldCommit('size', '1', 'input', 3), null);           // 1 文字目では書かない
  assert.equal(fieldCommit('size', '12', 'input', 3), null);
  assert.equal(fieldCommit('size', '12', 'commit', 3), 12);
  assert.equal(fieldCommit('size', '34', 'commit', 8), 34);
  assert.equal(fieldCommit('round', '12', 'commit', 4), 12);
  assert.equal(fieldCommit('pos', '0', 'commit', 2), 0);
  assert.equal(fieldCommit('size', '0', 'commit', 3), null);          // W / H は 1 以上
  assert.equal(fieldCommit('pos', '', 'commit', 2), null);            // 空・文字・負は書かない
  assert.equal(fieldCommit('pos', '-1', 'commit', 2), null);
  assert.equal(fieldCommit('pos', '3a', 'commit', 2), null);
  assert.equal(fieldCommit('size', '3', 'commit', 3), null);          // 同じ値は書かない(取り消し履歴を増やさない)
  assert.equal(fieldCommit('size', ' 12 ', 'commit', 3), 12);
});

test('fieldCommit: 色の欄は # と 6 桁が揃ったら打っている間にも書き、途中の # や桁不足は書かない', () => {
  for (const s of ['#', '#F', '#FF00', '#FF000']) {
    assert.equal(fieldCommit('color', s, 'input', '#3B82F6'), null, s);
    assert.equal(fieldCommit('color', s, 'commit', '#3B82F6'), null, s);
  }
  assert.equal(fieldCommit('color', '#FF0000', 'input', '#3B82F6'), '#FF0000');
  assert.equal(fieldCommit('color', '#ff0000', 'commit', '#3B82F6'), '#ff0000');
  assert.equal(fieldCommit('color', '#ff0000', 'commit', '#FF0000'), null);   // 大文字小文字だけの違いは同じ色
  assert.equal(fieldCommit('color', 'red', 'commit', '#3B82F6'), null);
  assert.equal(fieldCommit('color', '#FF0000', 'commit', undefined), '#FF0000');
});

test('fieldKeyAction: Enter で確定、Esc で取消、↑↓ は ▲▼、Tab / Shift+Tab は次・前の欄', () => {
  assert.equal(fieldKeyAction('Enter', false), 'commit');
  assert.equal(fieldKeyAction('Escape', false), 'cancel');
  assert.equal(fieldKeyAction('ArrowUp', false), 'up');
  assert.equal(fieldKeyAction('ArrowDown', false), 'dn');
  assert.equal(fieldKeyAction('Tab', false), 'next');
  assert.equal(fieldKeyAction('Tab', true), 'prev');
  assert.equal(fieldKeyAction('1', false), null);
  assert.equal(fieldKeyAction('ArrowLeft', false), null);            // 欄の中の ←→ はカーソル移動
});
