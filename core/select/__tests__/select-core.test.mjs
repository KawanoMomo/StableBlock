import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pressSelect, releaseSelect, pruneSelection, sameSelection, stepDelta, arrowNudge } from '../select-core.mjs';

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
