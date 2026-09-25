import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  contentExtent, grownCanvasSize, setCanvasInDsl, growCanvasInDsl, findFreeSlot, fitZoom, stepZoom,
} from '../layout-core.mjs';

const CV = { width: 400, height: 300, grid: 20 };

test('contentExtent: 要素の右端・下端(グリッド)', () => {
  assert.deepEqual(contentExtent([]), { right: 0, bottom: 0 });
  assert.deepEqual(contentExtent([{ x: 1, y: 2, w: 8, h: 3 }, { x: 5, y: 10, w: 20, h: 18 }]), { right: 25, bottom: 28 });
});

test('grownCanvasSize: 収まっていれば変えない・縮めない', () => {
  assert.deepEqual(grownCanvasSize(CV, [{ x: 1, y: 1, w: 8, h: 3 }]), { width: 400, height: 300 });
  assert.deepEqual(grownCanvasSize(CV, []), { width: 400, height: 300 });
  // ちょうど右端に接する(20 グリッド = 400px)なら広げない
  assert.deepEqual(grownCanvasSize(CV, [{ x: 12, y: 1, w: 8, h: 3 }]), { width: 400, height: 300 });
});

test('grownCanvasSize: はみ出した辺だけを 1 グリッドの余白付きで広げる', () => {
  // group 5,5 20x18 → 右端 25、下端 23 → 520 x 480
  assert.deepEqual(grownCanvasSize(CV, [{ x: 5, y: 5, w: 20, h: 18 }]), { width: 520, height: 480 });
  assert.deepEqual(grownCanvasSize(CV, [{ x: 1, y: 14, w: 8, h: 3 }]), { width: 400, height: 360 });
  assert.deepEqual(grownCanvasSize({ width: 400, height: 300, grid: 10 }, [{ x: 45, y: 1, w: 8, h: 3 }]), { width: 540, height: 300 });
});

test('setCanvasInDsl: @canvas 行の width / height だけを書き換える', () => {
  const src = '# t\n@canvas width=400 height=300 grid=20\n\nblock a "A" at 1,1 size 8x3\n';
  const out = setCanvasInDsl(src, 520, 480);
  assert.equal(out, '# t\n@canvas width=520 height=480 grid=20\n\nblock a "A" at 1,1 size 8x3\n');
  // 変わるのは 1 行だけ
  const diff = out.split('\n').filter((l, i) => l !== src.split('\n')[i]);
  assert.equal(diff.length, 1);
  // 同じ値なら同じ文字列
  assert.equal(setCanvasInDsl(src, 400, 300), src);
});

test('setCanvasInDsl: 属性の順と空白を保ち、欠けた属性は行末に足す', () => {
  assert.equal(setCanvasInDsl('@canvas  grid=10   width=100\n', 200, 300), '@canvas  grid=10   width=200 height=300\n');
});

test('setCanvasInDsl: CRLF の本文は CRLF のまま', () => {
  const src = '@canvas width=400 height=300\r\nblock a "A" at 1,1 size 8x3\r\n';
  assert.equal(setCanvasInDsl(src, 520, 300), '@canvas width=520 height=300\r\nblock a "A" at 1,1 size 8x3\r\n');
});

test('setCanvasInDsl: @canvas 行が無ければ先頭のコメントの直後に 1 行足す', () => {
  assert.equal(setCanvasInDsl('# t\n# u\nblock a "A" at 1,1 size 8x3\n', 980, 640),
    '# t\n# u\n@canvas width=980 height=640\nblock a "A" at 1,1 size 8x3\n');
  assert.equal(setCanvasInDsl('block a "A" at 1,1 size 8x3\r\n', 980, 640),
    '@canvas width=980 height=640\r\nblock a "A" at 1,1 size 8x3\r\n');
});

test('growCanvasInDsl: はみ出していなければ同じ文字列、はみ出せば @canvas 行だけが変わる', () => {
  const src = '@canvas width=400 height=300 grid=20\ngroup g "G" at 5,5 size 20x18\n';
  assert.equal(growCanvasInDsl(src, CV, [{ x: 1, y: 1, w: 8, h: 3 }]), src);
  assert.equal(growCanvasInDsl(src, CV, [{ x: 5, y: 5, w: 20, h: 18 }]),
    '@canvas width=520 height=480 grid=20\ngroup g "G" at 5,5 size 20x18\n');
});

test('findFreeSlot: 空の図は 1,1、以降は 1 グリッド空けて右へ並べ、行が尽きたら下の行へ', () => {
  const items = [];
  const put = () => { const p = findFreeSlot(items, 8, 3, { cols: 30 }); items.push({ ...p, w: 8, h: 3 }); return p; };
  assert.deepEqual(put(), { x: 1, y: 1 });
  assert.deepEqual(put(), { x: 10, y: 1 });
  assert.deepEqual(put(), { x: 19, y: 1 });
  assert.deepEqual(put(), { x: 1, y: 5 });   // 28+8 > 30 なので次の行
  // どれも重ならない
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
  }
});

test('findFreeSlot: group の上には置かない(group の外の空きに置く)', () => {
  const items = [{ x: 1, y: 1, w: 46, h: 6 }, { x: 1, y: 8, w: 46, h: 6 }];
  assert.deepEqual(findFreeSlot(items, 8, 3, { cols: 48 }), { x: 1, y: 15 });
});

test('findFreeSlot: 横に収まらない幅でも下に置ける', () => {
  assert.deepEqual(findFreeSlot([{ x: 1, y: 1, w: 8, h: 3 }], 60, 3, { cols: 48 }), { x: 1, y: 5 });
});

test('fitZoom: 表示欄に収まる倍率(拡大はしない)', () => {
  assert.equal(fitZoom(960, 520, 800, 600), 0.83);
  assert.equal(fitZoom(400, 300, 1200, 900), 1);
  assert.equal(fitZoom(4000, 3000, 400, 300), 0.1);
  assert.equal(fitZoom(0, 0, 400, 300), 1);
});

test('stepZoom: 0.25 刻み、端数からは刻みに戻る', () => {
  assert.equal(stepZoom(1, 1), 1.25);
  assert.equal(stepZoom(1, -1), 0.75);
  assert.equal(stepZoom(0.83, 1), 1);
  assert.equal(stepZoom(0.83, -1), 0.75);
  assert.equal(stepZoom(3, 1), 3);
  assert.equal(stepZoom(0.25, -1), 0.25);
  assert.equal(stepZoom(0.1, -1), 0.1);   // 全体表示で 0.25 未満になっていても − で大きくならない
  assert.equal(stepZoom(0.1, 1), 0.25);
});
