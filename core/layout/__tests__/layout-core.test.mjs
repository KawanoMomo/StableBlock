import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  contentExtent, grownCanvasSize, setCanvasInDsl, setCanvasRouteInDsl, growCanvasInDsl, findFreeSlot, placeNext, fitZoom, stepZoom,
  parentMap, moveSides, edgeSides, growToContain, fitParents, groupRectFor, lastChildBlock, placeInGroup,
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

// ── 入れ子の group(BLK-owner-20260926-0451-1) ──
const G = (id, x, y, w, h) => ({ type: 'group', id, x, y, w, h });
const B = (id, x, y, w, h = 3) => ({ type: 'block', id, x, y, w, h });

test('parentMap: 親は要素を含む最も小さい group。note と同じ大きさの group は親子にしない', () => {
  const ecu = G('ECU', 1, 1, 30, 14), mcu = G('MCU', 2, 3, 20, 8), same = G('same', 2, 3, 20, 8);
  const cpu = B('CPU', 3, 5, 8), can = B('CAN', 24, 3, 5), out = B('out', 40, 1, 5);
  const note = { type: 'note', id: 'n', x: 3, y: 5, w: 2, h: 1 };
  const m = parentMap([ecu, mcu, same, cpu, can, out, note]);
  assert.equal(m.CPU, 'MCU');
  assert.equal(m.CAN, 'ECU');
  assert.equal(m.MCU, 'ECU');
  assert.equal(m.same, 'ECU');
  assert.equal(m.out, undefined);
  assert.equal(m.ECU, undefined);
  assert.equal(m.n, undefined);
});

test('moveSides / edgeSides: 動いた向き・ハンドルの向きの辺', () => {
  assert.deepEqual(moveSides(0, 1), ['b']);
  assert.deepEqual(moveSides(-2, -1), ['l', 't']);
  assert.deepEqual(moveSides(0, 0), []);
  assert.deepEqual(edgeSides('se'), ['r', 'b']);
  assert.deepEqual(edgeSides('nw'), ['l', 't']);
});

test('growToContain: 越えた辺だけを 1 グリッドの余白付きで広げる。左・上は 0 で止める', () => {
  const p = { x: 1, y: 1, w: 20, h: 8 };
  assert.deepEqual(growToContain(p, { x: 2, y: 7, w: 8, h: 3 }, ['b']), { x: 1, y: 1, w: 20, h: 10 });
  assert.deepEqual(growToContain(p, { x: 2, y: 3, w: 8, h: 3 }, ['b']), p);
  assert.deepEqual(growToContain(p, { x: 0, y: 3, w: 8, h: 3 }, ['l']), { x: 0, y: 1, w: 21, h: 8 });
  // 動いた向きでない辺は見ない(元から枠に接している子で親を広げない)
  assert.deepEqual(growToContain(p, { x: 1, y: 7, w: 8, h: 3 }, ['r']), p);
});

test('fitParents: 矢印で子を親の下端より下へ動かすと、親(と親の親)が下に広がる', () => {
  const ecu = G('ECU', 1, 1, 30, 14), mcu = G('MCU', 2, 3, 20, 8), cpu = B('CPU', 3, 5, 8);
  const before = parentMap([ecu, mcu, cpu]);
  // CPU を 3 下へ: 5..8 → 8..11。MCU の下端は 11 → 余白 1 で 12 に。ECU の下端 15 はまだ足りる
  let ch = fitParents([ecu, mcu, { ...cpu, y: 8 }], before, [{ id: 'CPU', sides: ['b'] }]);
  assert.deepEqual(ch, [{ type: 'group', id: 'MCU', x: 2, y: 3, w: 20, h: 9 }]);
  // 矢印キーで 1 つずつ 7 回下へ(5 → 12、下端 15): MCU は 16 まで、ECU は 17 まで広がる
  const cur = { ECU: { ...ecu }, MCU: { ...mcu }, CPU: { ...cpu } };
  for (let i = 0; i < 7; i++) {
    cur.CPU.y++;
    for (const r of fitParents(Object.values(cur), before, [{ id: 'CPU', sides: ['b'] }])) Object.assign(cur[r.id], r);
  }
  assert.deepEqual([cur.MCU.y + cur.MCU.h, cur.ECU.y + cur.ECU.h], [16, 17]);
});

test('fitParents: 親の外へ出切った要素・親と一緒に動いた要素では親を広げない', () => {
  const ecu = G('ECU', 1, 1, 30, 14), cpu = B('CPU', 3, 5, 8);
  const before = parentMap([ecu, cpu]);
  assert.deepEqual(fitParents([ecu, { ...cpu, y: 20 }], before, [{ id: 'CPU', sides: ['b'] }]), []);
  // 親を選んで一緒に動かした(親の中で下端に接していた子もそのまま)
  const flush = B('F', 3, 12, 8);
  const b2 = parentMap([ecu, flush]);
  assert.deepEqual(fitParents([{ ...ecu, y: 2 }, { ...flush, y: 13 }], b2, [{ id: 'ECU', sides: ['b'] }, { id: 'F', sides: ['b'] }]), []);
});

test('groupRectFor: 上の段の block をまたがないよう、ラベルの帯を詰める', () => {
  // 親 Spi_Swc の中に 2 段。下の段の 2 つをグループ化
  const swc = G('Spi_Swc', 1, 1, 30, 12);
  const hal = B('Spi_Hal', 2, 3, 8), isr = B('Spi_Isr', 11, 3, 8);
  const core = B('Spi_Core', 2, 7, 8), dma = B('Spi_Dma', 11, 7, 8);
  const r = groupRectFor([core, dma], [swc, hal, isr]);
  // 上: 2 だと 5..(上の段の下端 6)にかかる → 1。左 1(x=1。親の枠の上なので親が広がる)、右 1、下 1
  assert.deepEqual(r, { x: 1, y: 6, w: 19, h: 5 });
  for (const o of [hal, isr]) assert.ok(!(r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h), `${o.id} に重なる`);
});

test('groupRectFor: 親の先頭の段では、ラベルの帯を親の内側 1 に収める', () => {
  const swc = G('P', 1, 1, 30, 12);
  const a = B('a', 2, 3, 8), b = B('b', 11, 3, 8);
  assert.deepEqual(groupRectFor([a, b], [swc], swc), { x: 1, y: 2, w: 19, h: 5 });
  // 親が無ければ上 2
  assert.deepEqual(groupRectFor([a, b], []), { x: 1, y: 1, w: 19, h: 6 });
});

test('groupRectFor → fitParents: 新しい group が親の枠に重なれば親が広がり、子は親の内側に収まる', () => {
  const swc = G('P', 1, 1, 19, 10);
  const a = B('a', 2, 3, 8), b = B('b', 10, 3, 8);
  const items = [swc, a, b];
  const before = parentMap(items);
  const r = groupRectFor([a, b], [swc], swc);
  const ng = { type: 'group', id: 'N', ...r };
  const ch = fitParents([...items, ng], { ...before, N: 'P' }, [{ id: 'N', sides: ['l', 't', 'r', 'b'] }]);
  const p = ch.length ? ch[0] : swc;
  assert.ok(ng.x >= p.x + 1 && ng.y >= p.y + 1 && ng.x + ng.w <= p.x + p.w - 1 && ng.y + ng.h <= p.y + p.h - 1, JSON.stringify({ ng, p }));
});

test('lastChildBlock: 子 group の中の block は親の直下の子に数えない', () => {
  const ecu = G('ECU', 1, 1, 30, 14), mcu = G('MCU', 2, 3, 20, 8);
  const cpu = B('CPU', 3, 5, 8), ram = B('RAM', 12, 5, 8), can = B('CAN', 23, 3, 6);
  assert.equal(lastChildBlock([ecu, mcu, cpu, ram, can], ecu).id, 'CAN');
  assert.equal(lastChildBlock([ecu, mcu, cpu, ram], ecu), null);
  assert.equal(lastChildBlock([ecu, mcu, cpu, ram], mcu).id, 'RAM');
});

test('placeInGroup: 子 group の中にも枠の上にも置かず、親の直下の空きに置く(足りなければ親が下に広がる)', () => {
  const ecu = G('ECU', 1, 1, 30, 11), mcu = G('MCU', 2, 3, 20, 8);
  const cpu = B('CPU', 3, 5, 8), ram = B('RAM', 12, 5, 8);
  const items = [ecu, mcu, cpu, ram];
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  let prev = null;
  const placed = [];
  for (let i = 0; i < 3; i++) {
    const p = placeInGroup([...items, ...placed], ecu, 6, 3, prev);
    const nb = B(`n${i}`, p.x, p.y, 6);
    assert.ok(!hit(nb, mcu), `${nb.id} が MCU に掛かる ${JSON.stringify(nb)}`);
    for (const o of [...placed]) assert.ok(!hit(nb, o));
    Object.assign(ecu, p.group);
    placed.push(nb); prev = nb;
  }
  // 全部 ECU の内側
  for (const b of placed) assert.ok(b.x >= ecu.x && b.y >= ecu.y && b.x + b.w <= ecu.x + ecu.w && b.y + b.h <= ecu.y + ecu.h);
  assert.equal(parentMap([ecu, mcu, cpu, ram, ...placed]).n0, 'ECU');
});

test('placeInGroup: 親の枠をまたいでいる子 group も避ける', () => {
  const ecu = G('ECU', 1, 1, 22, 10), mcu = G('MCU', 2, 3, 24, 6);   // MCU が ECU の右へはみ出している
  const p = placeInGroup([ecu, mcu], ecu, 6, 3, null);
  const nb = B('x', p.x, p.y, 6);
  assert.ok(!(nb.x < mcu.x + mcu.w && mcu.x < nb.x + nb.w && nb.y < mcu.y + mcu.h && mcu.y < nb.y + nb.h), JSON.stringify(nb));
});

test('fitParents: 広がった子 group は下の兄弟を取り込まず、隙間を保って押し出す(親も広がる)', () => {
  const ecu = G('ECU', 1, 1, 30, 14), mcu = G('MCU', 2, 3, 20, 7), cpu = B('CPU', 3, 5, 8), can = B('CAN', 3, 11, 8);
  const before = parentMap([ecu, mcu, cpu, can]);
  assert.equal(before.CAN, 'ECU');
  const cur = { ECU: { ...ecu }, MCU: { ...mcu }, CPU: { ...cpu }, CAN: { ...can } };
  for (let i = 0; i < 5; i++) {
    cur.CPU.y++;
    for (const r of fitParents(Object.values(cur), before, [{ id: 'CPU', sides: ['b'] }])) Object.assign(cur[r.id], r);
    const now = parentMap(Object.values(cur));
    assert.equal(now.CAN, 'ECU', `${i + 1} 回目で CAN が MCU に取り込まれた`);
    assert.equal(now.CPU, 'MCU');
  }
  assert.equal(cur.CAN.y, cur.MCU.y + cur.MCU.h + 1);            // 隙間 1 を保つ
  assert.ok(cur.CAN.y + cur.CAN.h + 1 <= cur.ECU.y + cur.ECU.h);  // 親の内側
});

test('fitParents: 押し出した要素の型を返す(block は at だけ、group は at と size)', () => {
  const p = G('P', 0, 0, 20, 10), a = B('a', 1, 2, 8), b = B('b', 1, 6, 8);
  const ch = fitParents([p, { ...a, x: 12 }, b], parentMap([p, a, b]), [{ id: 'a', sides: ['r'] }]);
  assert.deepEqual(ch, [{ type: 'group', id: 'P', x: 0, y: 0, w: 21, h: 10 }]);
});

test('fitParents(seeds): 新しい group の下・右の余白で兄弟に接するなら、隙間 1 を保って押し出す', () => {
  const ecu = G('ECU', 1, 1, 20, 12), cpu = B('CPU', 2, 3, 8), ram = B('RAM', 11, 3, 8), flash = B('Flash', 2, 7, 8);
  const r = groupRectFor([cpu, ram], [ecu, flash], ecu);
  assert.deepEqual(r, { x: 1, y: 2, w: 19, h: 5 });       // 下の余白 1 で Flash(y=7)に接する
  const mcu = { type: 'group', id: 'MCU', ...r };
  const parents = { ...parentMap([ecu, cpu, ram, flash]), MCU: 'ECU', CPU: 'MCU', RAM: 'MCU' };
  const ch = fitParents([ecu, cpu, ram, flash, mcu], parents, [{ id: 'MCU', sides: ['l', 't', 'r', 'b'] }], 1,
    [{ id: 'MCU', from: { x: 1, y: 2, w: 18, h: 4 } }]);
  const by = Object.fromEntries(ch.map(c => [c.id, c]));
  assert.equal(by.Flash.y, 8);                              // MCU の下端 7 から 1 空ける
  assert.equal(by.ECU.x, 0);                                // MCU が ECU の左の枠に掛かるので ECU が左へ広がる
  assert.ok(by.ECU.y + by.ECU.h >= 8 + 3 + 1);
});
