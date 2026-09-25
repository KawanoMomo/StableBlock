import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  contentExtent, grownCanvasSize, setCanvasInDsl, setCanvasRouteInDsl, growCanvasInDsl, findFreeSlot, placeNext, fitZoom, stepZoom,
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

test('placeNext: 直前に置いたものの右隣に、同じ行で並べる', () => {
  const a = { x: 1, y: 1, w: 8, h: 3 };
  assert.deepEqual(placeNext([a], 8, 3, { prev: a, cols: 48 }), { x: 10, y: 1 });
});

test('placeNext: 行の右端を超えたら次の行の左端へ(同じ大きさなら縦もそろう)', () => {
  const items = [], cols = 28;   // 8 幅 + 間 1 で 1 行に 3 個
  let prev = null;
  for (let i = 0; i < 8; i++) {
    const p = placeNext(items, 8, 3, { prev, cols });
    prev = { ...p, w: 8, h: 3 };
    items.push(prev);
  }
  assert.deepEqual(items.map(r => `${r.x},${r.y}`), ['1,1', '10,1', '19,1', '1,5', '10,5', '19,5', '1,9', '10,9']);
});

test('placeNext: 直前より前の穴は埋めず、ほかの要素とは重ならない', () => {
  const g = { x: 20, y: 0, w: 10, h: 10 };   // 右にある別の要素
  const a = { x: 1, y: 1, w: 8, h: 3 }, b = { x: 10, y: 1, w: 8, h: 3 };
  const p = placeNext([g, a, b], 8, 3, { prev: b, cols: 48 });
  assert.deepEqual(p, { x: 31, y: 1 });
});

test('placeNext: prev が無ければ領域の左上から(group の中: x0 / y0 / cols で領域を渡す)', () => {
  assert.deepEqual(placeNext([], 8, 3, { x0: 6, y0: 7, cols: 24 }), { x: 6, y: 7 });
  const c1 = { x: 6, y: 7, w: 8, h: 3 };
  assert.deepEqual(placeNext([c1], 8, 3, { prev: c1, x0: 6, y0: 7, cols: 24 }), { x: 15, y: 7 });
  const c2 = { x: 15, y: 7, w: 8, h: 3 };
  assert.deepEqual(placeNext([c1, c2], 8, 3, { prev: c2, x0: 6, y0: 7, cols: 24 }), { x: 6, y: 11 });   // group の下へ伸ばす
});

test('placeNext: 行に収まらない幅でも止まらない', () => {
  assert.deepEqual(placeNext([], 60, 3, { cols: 48 }), { x: 1, y: 1 });
});

test('setCanvasRouteInDsl: @canvas 行の route= だけを書き換え、曲線に戻すと消して元のバイトに戻る', () => {
  const src = '# 図\n@canvas width=400 height=300 grid=20\nblock a "A" at 1,1 size 4x2\n';
  const s1 = setCanvasRouteInDsl(src, 'straight');
  assert.equal(s1, '# 図\n@canvas width=400 height=300 grid=20 route=straight\nblock a "A" at 1,1 size 4x2\n');
  const s2 = setCanvasRouteInDsl(s1, 'ortho');
  assert.equal(s2, src.replace('grid=20', 'grid=20 route=ortho'));
  assert.equal(setCanvasRouteInDsl(s2, 'curved'), src);
  assert.equal(setCanvasRouteInDsl(src, 'curved'), src);
  // route が行の途中にあっても、ほかの属性と CRLF は触らない
  assert.equal(setCanvasRouteInDsl('@canvas route=ortho width=400\r\nx\r\n', 'straight'), '@canvas route=straight width=400\r\nx\r\n');
  assert.equal(setCanvasRouteInDsl('@canvas route=ortho width=400\r\nx\r\n', 'curved'), '@canvas width=400\r\nx\r\n');
});

test('setCanvasRouteInDsl: @canvas 行が無ければ先頭のコメントの後に 1 行足す(曲線なら何も足さない)', () => {
  const src = '# 図\nblock a "A" at 1,1 size 4x2\n';
  assert.equal(setCanvasRouteInDsl(src, 'ortho'), '# 図\n@canvas route=ortho\nblock a "A" at 1,1 size 4x2\n');
  assert.equal(setCanvasRouteInDsl(src, 'curved'), src);
  assert.equal(setCanvasRouteInDsl('block a "A" at 1,1 size 4x2\r\n', 'straight'), '@canvas route=straight\r\nblock a "A" at 1,1 size 4x2\r\n');
});
