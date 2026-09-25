import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extendPoint, bezierControls, bezierMidpoint, orthoPoints, polylineMidpoint,
  parseLpos, labelLayout, setConnLabelInDsl, chainConnectInDsl,
  connPathInfo, canvasRoute, connRoute, nextCanvasRoute, connectionPaths, pathPoints, computePorts,
  connLinesAmong, remapConnLine,
} from '../label-core.mjs';
import { parseDSL } from '../../dsl/dsl-core.mjs';

test('extendPoint moves point in side direction', () => {
  assert.deepEqual(extendPoint({ x: 10, y: 20 }, 'top', 5), { x: 10, y: 15 });
  assert.deepEqual(extendPoint({ x: 10, y: 20 }, 'bottom', 5), { x: 10, y: 25 });
  assert.deepEqual(extendPoint({ x: 10, y: 20 }, 'left', 5), { x: 5, y: 20 });
  assert.deepEqual(extendPoint({ x: 10, y: 20 }, 'right', 5), { x: 15, y: 20 });
});

test('bezierControls matches legacy bpath math (dist>=75 => cpd=dist*0.4)', () => {
  // dist=100, cpd=40
  const { c1, c2 } = bezierControls({ x: 0, y: 0 }, { x: 100, y: 0 }, 'right', 'left');
  assert.deepEqual(c1, { x: 40, y: 0 });
  assert.deepEqual(c2, { x: 60, y: 0 });
});

test('bezierControls floors cpd at 30 for short distances', () => {
  // dist=10 => cpd=30
  const { c1, c2 } = bezierControls({ x: 0, y: 0 }, { x: 10, y: 0 }, 'right', 'left');
  assert.deepEqual(c1, { x: 30, y: 0 });
  assert.deepEqual(c2, { x: -20, y: 0 });
});

test('bezierMidpoint is (P0+3C1+3C2+P3)/8', () => {
  const mid = bezierMidpoint({ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 60, y: 0 }, { x: 100, y: 0 });
  assert.deepEqual(mid, { x: 50, y: 0 });
  const mid2 = bezierMidpoint({ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 100, y: 60 }, { x: 100, y: 100 });
  assert.deepEqual(mid2, { x: 50, y: 50 });
});

test('orthoPoints horizontal-horizontal produces 6-point polyline', () => {
  // fs=right, ts=left => e1={20,0}, e2={80,60}, mx=50
  const pts = orthoPoints({ x: 0, y: 0 }, { x: 100, y: 60 }, 'right', 'left');
  assert.deepEqual(pts, [
    { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 50, y: 0 },
    { x: 50, y: 60 }, { x: 80, y: 60 }, { x: 100, y: 60 },
  ]);
});

test('orthoPoints vertical-vertical produces 6-point polyline', () => {
  // fs=bottom, ts=top => e1={0,20}, e2={100,40}, my=30
  const pts = orthoPoints({ x: 0, y: 0 }, { x: 100, y: 60 }, 'bottom', 'top');
  assert.deepEqual(pts, [
    { x: 0, y: 0 }, { x: 0, y: 20 }, { x: 0, y: 30 },
    { x: 100, y: 30 }, { x: 100, y: 40 }, { x: 100, y: 60 },
  ]);
});

test('orthoPoints vertical-horizontal produces 5-point polyline', () => {
  // fs=bottom(isVF), ts=left(!isVT) => e1={0,20}, e2={80,60} => corner {e1.x, e2.y}
  const pts = orthoPoints({ x: 0, y: 0 }, { x: 100, y: 60 }, 'bottom', 'left');
  assert.deepEqual(pts, [
    { x: 0, y: 0 }, { x: 0, y: 20 }, { x: 0, y: 60 }, { x: 80, y: 60 }, { x: 100, y: 60 },
  ]);
});

test('orthoPoints horizontal-vertical produces 5-point polyline', () => {
  // fs=right(!isVF), ts=top(isVT) => e1={20,0}, e2={100,40} => corner {e2.x, e1.y}
  const pts = orthoPoints({ x: 0, y: 0 }, { x: 100, y: 60 }, 'right', 'top');
  assert.deepEqual(pts, [
    { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }, { x: 100, y: 60 },
  ]);
});

test('polylineMidpoint finds half-length point on middle segment', () => {
  // 上のHHケース: 区間長 20,30,60,30,20 / 全長160 / 半分80 => 第3区間(垂直)の30px地点
  const pts = [
    { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 50, y: 0 },
    { x: 50, y: 60 }, { x: 80, y: 60 }, { x: 100, y: 60 },
  ];
  assert.deepEqual(polylineMidpoint(pts), { x: 50, y: 30 });
});

test('polylineMidpoint handles degenerate zero-length polyline', () => {
  assert.deepEqual(polylineMidpoint([{ x: 5, y: 5 }, { x: 5, y: 5 }]), { x: 5, y: 5 });
});

test('parseLpos extracts value with right default and fallback', () => {
  assert.equal(parseLpos('lpos=left'), 'left');
  assert.equal(parseLpos('color=#fff lpos=center width=2'), 'center');
  assert.equal(parseLpos(''), 'right');
  assert.equal(parseLpos(undefined), 'right');
  assert.equal(parseLpos('lpos=weird'), 'right');
  assert.equal(parseLpos('color=#64748B'), 'right');
});

test('labelLayout right: text starts 10px right of mid, bg wraps text', () => {
  const L = labelLayout({ x: 100, y: 50 }, 'right', 30);
  assert.equal(L.tx, 110);
  assert.equal(L.ty, 50);
  assert.equal(L.anchor, 'start');
  assert.deepEqual(L.bg, { x: 106, y: 43, w: 38, h: 14, rx: 2 });
});

test('labelLayout left: text ends 10px left of mid', () => {
  const L = labelLayout({ x: 100, y: 50 }, 'left', 30);
  assert.equal(L.tx, 90);
  assert.equal(L.anchor, 'end');
  assert.deepEqual(L.bg, { x: 56, y: 43, w: 38, h: 14, rx: 2 });
});

test('labelLayout top/bottom: ty offset, centered horizontally', () => {
  const t = labelLayout({ x: 100, y: 50 }, 'top', 30);
  assert.equal(t.tx, 100);
  assert.equal(t.ty, 40);
  assert.equal(t.anchor, 'middle');
  assert.deepEqual(t.bg, { x: 81, y: 33, w: 38, h: 14, rx: 2 });
  const b = labelLayout({ x: 100, y: 50 }, 'bottom', 30);
  assert.equal(b.ty, 60);
  assert.deepEqual(b.bg, { x: 81, y: 53, w: 38, h: 14, rx: 2 });
});

test('labelLayout center: no offset', () => {
  const L = labelLayout({ x: 100, y: 50 }, 'center', 30);
  assert.equal(L.tx, 100);
  assert.equal(L.ty, 50);
  assert.equal(L.anchor, 'middle');
  assert.deepEqual(L.bg, { x: 81, y: 43, w: 38, h: 14, rx: 2 });
});

test('setConnLabelInDsl replaces existing label', () => {
  const dsl = 'block a "A" at 1,1 size 4x2\na -> b "old" color=#fff';
  assert.equal(setConnLabelInDsl(dsl, 'a', 'b', 'new'),
    'block a "A" at 1,1 size 4x2\na -> b "new" color=#fff');
});

test('setConnLabelInDsl inserts label before existing attributes', () => {
  assert.equal(setConnLabelInDsl('a -> b color=#fff', 'a', 'b', 'x'),
    'a -> b "x" color=#fff');
  assert.equal(setConnLabelInDsl('a --> b', 'a', 'b', 'x'), 'a --> b "x"');
});

test('setConnLabelInDsl removes label on empty string (ECN-002: 行は残す)', () => {
  assert.equal(setConnLabelInDsl('a -> b "old" width=2', 'a', 'b', ''),
    'a -> b width=2');
  assert.equal(setConnLabelInDsl('a -> b "old"', 'a', 'b', ''), 'a -> b');
});

test('setConnLabelInDsl matches direction-agnostically like setConnProp', () => {
  assert.equal(setConnLabelInDsl('b -> a "old"', 'a', 'b', 'new'), 'b -> a "new"');
});

test('setConnLabelInDsl strips double quotes from input', () => {
  assert.equal(setConnLabelInDsl('a -> b', 'a', 'b', 'say "hi"'), 'a -> b "say hi"');
});

test('setConnLabelInDsl is safe with $ patterns in label', () => {
  assert.equal(setConnLabelInDsl('a -> b "old"', 'a', 'b', 'cost $1 $& $$'),
    'a -> b "cost $1 $& $$"');
});

test('setConnLabelInDsl no-op when no matching connection', () => {
  assert.equal(setConnLabelInDsl('a -> b "old"', 'x', 'y', 'new'), 'a -> b "old"');
});

test('setConnLabelInDsl preserves leading whitespace and touches first match only', () => {
  const dsl = '  a -> b "one"\na -> b "two"';
  assert.equal(setConnLabelInDsl(dsl, 'a', 'b', 'z'), '  a -> b "z"\na -> b "two"');
});

// ─── ID ───
import { isValidId, labelToId, uniqueId, renameIdInDsl } from '../label-core.mjs';

test('labelToId keeps case and underscores', () => {
  assert.equal(labelToId('Spi_Api'), 'Spi_Api');
  assert.equal(labelToId('Spi Driver'), 'Spi_Driver');
  assert.equal(labelToId('App\nSWC'), 'App_SWC');
  assert.equal(labelToId('SPI ドライバ'), 'SPI');
  assert.equal(labelToId('ドライバ'), '');
  assert.equal(labelToId('A'.repeat(40)).length, 30);
});

test('isValidId accepts alnum and underscore only', () => {
  assert.ok(isValidId('Spi_Driver'));
  assert.ok(isValidId('a1'));
  assert.ok(!isValidId(''));
  assert.ok(!isValidId('a b'));
  assert.ok(!isValidId('a-b'));
  assert.ok(!isValidId('ドライバ'));
});

test('uniqueId appends _N on collision', () => {
  assert.equal(uniqueId('a', new Set()), 'a');
  assert.equal(uniqueId('a', new Set(['a'])), 'a_2');
  assert.equal(uniqueId('a', ['a', 'a_2']), 'a_3');
});

test('renameIdInDsl rewrites only the definition and connection endpoints', () => {
  const dsl = [
    'block SpiDrv "SpiDrv の上" at 1,1 size 4x2',
    'block app "App" at 8,1 size 4x2',
    'app -> SpiDrv "SpiDrv へ"',
    'SpiDrv --> app color=#EF4444',
    '# SpiDrv はコメント',
    'block SpiDrv2 "x" at 1,5 size 4x2',
    'SpiDrv2 -> app',
  ].join('\n');
  const out = renameIdInDsl(dsl, 'SpiDrv', 'Spi_Driver').split('\n');
  assert.equal(out[0], 'block Spi_Driver "SpiDrv の上" at 1,1 size 4x2');
  assert.equal(out[2], 'app -> Spi_Driver "SpiDrv へ"');
  assert.equal(out[3], 'Spi_Driver --> app color=#EF4444');
  assert.equal(out[4], '# SpiDrv はコメント');
  assert.equal(out[5], 'block SpiDrv2 "x" at 1,5 size 4x2');
  assert.equal(out[6], 'SpiDrv2 -> app');
});

test('renameIdInDsl keeps indentation and spacing', () => {
  const dsl = '  note  m1 "memo" at 1,1 size 4x2\nm1   ->   b';
  assert.equal(renameIdInDsl(dsl, 'm1', 'Memo'), '  note  Memo "memo" at 1,1 size 4x2\nMemo   ->   b');
});

test('renameIdInDsl with duplicate ids renames the given line only and leaves connections', () => {
  const dsl = 'block a "A" at 1,1 size 4x2\nblock a "A2" at 8,1 size 4x2\na -> b';
  assert.equal(renameIdInDsl(dsl, 'a', 'a_2', 2), 'block a "A" at 1,1 size 4x2\nblock a_2 "A2" at 8,1 size 4x2\na -> b');
});

test('renameIdInDsl returns dsl unchanged when the id is absent', () => {
  assert.equal(renameIdInDsl('block a "A" at 1,1 size 4x2', 'zz', 'y'), 'block a "A" at 1,1 size 4x2');
});

test('線の形: 接続の route → @canvas の route → 曲線 の順で決まる(GUI に表示だけの状態は無い)', () => {
  assert.equal(canvasRoute({}), 'curved');
  assert.equal(canvasRoute(undefined), 'curved');
  assert.equal(canvasRoute({ route: 'ortho' }), 'ortho');
  assert.equal(canvasRoute({ route: 'zigzag' }), 'curved');
  assert.equal(connRoute({ route: null }, { route: 'straight' }), 'straight');
  assert.equal(connRoute({ route: 'curved' }, { route: 'straight' }), 'curved');
  assert.equal(connRoute({}, {}), 'curved');
  assert.deepEqual([undefined, 'curved', 'straight', 'ortho'].map(nextCanvasRoute), ['straight', 'straight', 'ortho', 'curved']);
});

test('connPathInfo: 曲線・直線・直角の path と中点', () => {
  const fp = { x: 0, y: 0 }, tp = { x: 100, y: 40 };
  assert.deepEqual(connPathInfo(fp, tp, 'right', 'left', 'straight'), { d: 'M0,0 L100,40', mid: { x: 50, y: 20 } });
  const o = connPathInfo(fp, tp, 'right', 'left', 'ortho');
  const pts = orthoPoints(fp, tp, 'right', 'left');
  assert.equal(o.d, 'M' + pts.map(p => `${p.x},${p.y}`).join(' L'));
  assert.deepEqual(o.mid, polylineMidpoint(pts));
  const c = connPathInfo(fp, tp, 'right', 'left', 'curved');
  const { c1, c2 } = bezierControls(fp, tp, 'right', 'left');
  assert.equal(c.d, `M0,0 C${c1.x},${c1.y} ${c2.x},${c2.y} 100,40`);
  assert.deepEqual(c.mid, bezierMidpoint(fp, c1, c2, tp));
  assert.deepEqual(connPathInfo(fp, tp, 'right', 'left', undefined), c);
});

test('connectionPaths: @canvas の route が本文にあればそれで経路を作る(検査・描画が同じ形を見る)', () => {
  const body = 'block a "A" at 1,1 size 4x2\nblock b "B" at 10,6 size 4x2\na -> b\n';
  const straight = connectionPaths(parseDSL('@canvas width=400 route=straight\n' + body));
  assert.equal(straight[0].pts.length, 2);
  const curved = connectionPaths(parseDSL('@canvas width=400\n' + body));
  assert.equal(curved[0].pts.length, 25);
  // 接続の route は @canvas より強い
  const own = connectionPaths(parseDSL('@canvas width=400 route=straight\n' + body.replace('a -> b', 'a -> b route=ortho')));
  const p = parseDSL('@canvas width=400\n' + body);
  const port = computePorts(p.connections, p.blockMap, 20)[0];
  assert.deepEqual(own[0].pts, pathPoints(port.fp, port.tp, port.fs, port.ts, 'ortho'));
});

// ─── 接続ラベルの置き場所(placeLabels / labelIssues)。ラベルは block より上に描き、既定では block の名前・他のラベルを避ける ───
import { readFileSync as sbRead } from 'node:fs';
import { fileURLToPath as sbPath } from 'node:url';
import { hasLpos, placeLabel, placeLabels, labelIssues, estimateTextWidth } from '../label-core.mjs';
import { parseDSL as sbParse } from '../../dsl/dsl-core.mjs';

const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const blockRect = (b, g) => ({ x: b.x * g, y: b.y * g, w: b.w * g, h: b.h * g });

test('hasLpos: 本文に lpos= が書かれているか', () => {
  assert.equal(hasLpos('color=#fff lpos=top'), true);
  assert.equal(hasLpos('lpos=right'), true);
  assert.equal(hasLpos('color=#fff'), false);
  assert.equal(hasLpos(undefined), false);
});

test('placeLabels: 1 グリッド間隔で 8 block・10 本のラベルが、block の名前にも他のラベルにも掛からない(owner 批評の図)', () => {
  const text = sbRead(sbPath(new URL('../../../tests/e2e/fixtures/owner-critique2-swc.sb', import.meta.url)), 'utf8');
  const p = sbParse(text);
  const placed = placeLabels(connectionPaths(p, 'curved'), p);
  assert.equal(placed.length, 10);
  assert.deepEqual(labelIssues(placed, p), []);
  // 以前の既定(中点の右)では req は Spi_Driver の地に 300px² 以上沈んでいた。今は掛かっても縁だけ
  const req = placed.find(l => l.conn.label === 'req');
  assert.notEqual(req.lpos, 'right');
  assert.ok(overlap(req.bg, blockRect(p.blockMap.Spi_Driver, 20)) < 60);
  for (let i = 0; i < placed.length; i++) for (let j = 0; j < i; j++) assert.ok(overlap(placed[i].bg, placed[j].bg) < 6, `${placed[i].conn.label} と ${placed[j].conn.label}`);
});

test('placeLabels: 隙間が広い既存の図は今までどおり中点の右(見た目を変えない)', () => {
  const p = sbParse('@canvas width=400 height=200 grid=20\nblock a "A" at 1,1 size 4x2\nblock b "B" at 14,1 size 4x2\na -> b "payload"\n');
  const [l] = placeLabels(connectionPaths(p, 'curved'), p);
  assert.equal(l.lpos, 'right');
});

test('placeLabels: 本文に lpos= があればその位置のまま(掛かっても動かさない)', () => {
  const p = sbParse('@canvas width=400 height=200 grid=20\nblock a "A" at 1,1 size 4x2\nblock b "B" at 6,1 size 4x2\na -> b "req" lpos=right\n');
  const [l] = placeLabels(connectionPaths(p, 'curved'), p);
  assert.equal(l.lpos, 'right');
  const q = sbParse('@canvas width=400 height=200 grid=20\nblock a "A" at 1,1 size 4x2\nblock b "B" at 6,1 size 4x2\na -> b "req"\n');
  assert.notEqual(placeLabels(connectionPaths(q, 'curved'), q)[0].lpos, 'right');
});

test('placeLabel: どの候補も掛かるなら一番掛からない位置、キャンバスの外には出さない', () => {
  const obstacles = [{ x: 0, y: 0, w: 100, h: 30, weight: 1 }];
  const L = placeLabel({ x: 50, y: 20 }, 'right', 20, obstacles, true, { x: 0, y: 0, w: 100, h: 100 });
  assert.equal(L.lpos, 'bottom');   // 下だけが block の外へ半分出られる
  const edge = placeLabel({ x: 95, y: 50 }, 'right', 20, [], true, { x: 0, y: 0, w: 100, h: 100 });
  assert.notEqual(edge.lpos, 'right');
  assert.ok(estimateTextWidth('ab') < estimateTextWidth('あい'));
});

test('labelIssues: 読めないラベル(note の下・block の名前・他のラベル)を挙げる', () => {
  const p = sbParse('@canvas width=400 height=300 grid=20\nblock a "A" at 1,1 size 4x2\nblock b "B" at 1,8 size 4x2\nnote n "memo" at 0,4 size 8x3\na -> b "hidden" lpos=center\n');
  const placed = placeLabels(connectionPaths(p, 'straight'), p);
  const issues = labelIssues(placed, p);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, 'note');
  assert.equal(issues[0].item.id, 'n');
  const q = sbParse('@canvas width=400 height=300 grid=20\nblock a "Alpha" at 1,1 size 6x2\nblock b "Beta" at 1,4 size 6x1\na -> b "over" lpos=bottom\n');
  const qi = labelIssues(placeLabels(connectionPaths(q, 'straight'), q), q);
  assert.deepEqual(qi.map(i => [i.kind, i.item.id]), [['text', 'b']]);
});

// ─── 図をまたぐ参照探しと改名(findIdInDsl / renameIdAcrossDsl / planRename) ───
import { findIdInDsl, renameIdAcrossDsl, planRename, idSpansInLine } from '../label-core.mjs';

test('idSpansInLine: 定義行の ID と接続の両端の列(F2 で押した位置が ID かを決める)', () => {
  assert.deepEqual(idSpansInLine('  block SpiDrv "SpiDrv" at 1,1 size 4x2'), [{ id: 'SpiDrv', start: 8, end: 14 }]);
  assert.deepEqual(idSpansInLine('app  -->  SpiDrv "x"'), [{ id: 'app', start: 0, end: 3 }, { id: 'SpiDrv', start: 10, end: 16 }]);
  assert.deepEqual(idSpansInLine('# block SpiDrv'), []);
});

test('findIdInDsl: 定義行と接続の from / to だけを拾い、ラベル・コメントの同じ文字列は拾わない', () => {
  const dsl = '# SpiDrv の図\r\nblock SpiDrv "SpiDrv" at 1,1 size 4x2\r\nblock b "uses SpiDrv" at 8,1 size 4x2\r\nSpiDrv -> b "SpiDrv"\r\nb --> SpiDrv\r\n';
  assert.deepEqual(findIdInDsl(dsl, 'SpiDrv').map(r => [r.line, r.kind]), [[2, 'def'], [4, 'ref'], [5, 'ref']]);
  assert.equal(findIdInDsl(dsl, 'SpiDrv')[0].text, 'block SpiDrv "SpiDrv" at 1,1 size 4x2');   // 行末の \r は含めない
  assert.deepEqual(findIdInDsl(dsl, 'Spi'), []);
});

test('renameIdAcrossDsl: 定義の無い図(@include 先の定義を参照する図)は接続の from / to だけを変える', () => {
  const user = '@include "shared/common.sb"\r\nblock app "App" at 1,1 size 4x2\r\napp -> SpiDrv "req"\r\n# SpiDrv はここ\r\n';
  assert.equal(renameIdAcrossDsl(user, 'SpiDrv', 'Spi_Driver'),
    '@include "shared/common.sb"\r\nblock app "App" at 1,1 size 4x2\r\napp -> Spi_Driver "req"\r\n# SpiDrv はここ\r\n');
  const def = '﻿block SpiDrv "SpiDrv" at 1,1 size 4x2\nSpiDrv -> app\n';
  assert.equal(renameIdAcrossDsl(def, 'SpiDrv', 'Spi_Driver'), '﻿block Spi_Driver "Spi_Driver" at 1,1 size 4x2\nSpi_Driver -> app\n');
  assert.equal(renameIdAcrossDsl('block a "A" at 1,1 size 4x2\n', 'SpiDrv', 'X'), 'block a "A" at 1,1 size 4x2\n');
});

test('planRename: 全図の変わる行は定義行と接続行だけ。座標・サイズの行は 1 バイトも変えない', () => {
  const files = [
    { path: 'shared/common.sb', text: 'block SpiDrv "SPI" at 1,1 size 4x2\r\nblock os "OS" at 1,5 size 4x2\r\n' },
    { path: 'spi_swc.sb', text: '@include "shared/common.sb"\r\nblock app "App" at 8,1 size 4x2\r\napp -> SpiDrv\r\nSpiDrv -> os\r\n' },
    { path: 'can_swc.sb', text: 'block can "Can" at 1,1 size 4x2\r\n' },
  ];
  const plan = planRename(files, 'SpiDrv', 'Spi_Driver');
  assert.equal(plan.error, undefined);
  assert.equal(plan.defs, 1);
  assert.deepEqual(plan.changes.map(c => [c.path, c.lines.map(l => l.line)]), [['shared/common.sb', [1]], ['spi_swc.sb', [3, 4]]]);
  assert.equal(plan.changes[1].text, '@include "shared/common.sb"\r\nblock app "App" at 8,1 size 4x2\r\napp -> Spi_Driver\r\nSpi_Driver -> os\r\n');
  assert.deepEqual(plan.changes[1].lines[0], { line: 3, before: 'app -> SpiDrv', after: 'app -> Spi_Driver' });
});

test('planRename: 使えない表記・既にある ID・どこにも無い ID は何も変えずに理由を返す', () => {
  const files = [{ path: 'a.sb', text: 'block SpiDrv "S" at 1,1 size 4x2\n' }, { path: 'b.sb', text: 'block Spi_Driver "S" at 1,1 size 4x2\n' }];
  assert.match(planRename(files, 'SpiDrv', 'Spi Driver').error, /ID に使えない/);
  assert.match(planRename(files, 'SpiDrv', 'Spi_Driver').error, /既に定義されている: b\.sb:1/);
  assert.match(planRename(files, 'Nope', 'X').error, /定義・参照している図が無い/);
  assert.match(planRename(files, 'SpiDrv', 'SpiDrv').error, /同じ/);
  const dup = [{ path: 'd.sb', text: 'block a "A" at 1,1 size 4x2\nblock a "A2" at 8,1 size 4x2\na -> a\n' }];
  assert.match(planRename(dup, 'a', 'b').error, /d\.sb で 2 回定義されている\(L1, L2\)/);
});

test('connLinesAmong: 両端とも選んだ要素の接続の行だけを、属性ごと返す', () => {
  const dsl = [
    '@canvas width=400 height=300 grid=20',
    'block a "A" at 1,1 size 4x2',
    'block b "B" at 6,1 size 4x2',
    'block c "C" at 11,1 size 4x2',
    'a -> b "req" color=#EF4444 lpos=top',
    '  b --> c',
    'c -> a',
    '# a -> c はコメント',
  ].join('\r\n');
  assert.deepEqual(connLinesAmong(dsl, ['a', 'b']), ['a -> b "req" color=#EF4444 lpos=top']);
  assert.deepEqual(connLinesAmong(dsl, new Set(['a', 'b', 'c'])), ['a -> b "req" color=#EF4444 lpos=top', 'b --> c', 'c -> a']);
  assert.deepEqual(connLinesAmong(dsl, ['a']), []);
});

test('remapConnLine: from / to だけを新しい ID に付け替え、片方が無ければ null', () => {
  const map = { a: '__new_1', b: '__new_2' };
  assert.equal(remapConnLine('a -> b "req" color=#EF4444', map), '__new_1 -> __new_2 "req" color=#EF4444');
  assert.equal(remapConnLine('b --> a', map), '__new_2 --> __new_1');
  assert.equal(remapConnLine('a -> c', map), null);
  assert.equal(remapConnLine('block a "A" at 1,1 size 4x2', map), null);
});

test('chainConnectInDsl: 選んだ順に鎖状に結び、既にある組(向きを問わず)は足さない', () => {
  const dsl = 'block a "A" at 1,1 size 2x2\nblock b "B" at 5,1 size 2x2\nblock c "C" at 9,1 size 2x2\nblock d "D" at 13,1 size 2x2\nc -> b\n';
  const r = chainConnectInDsl(dsl, ['a', 'b', 'c', 'd'], [{ from: 'c', to: 'b' }]);
  assert.deepEqual(r.added, [{ from: 'a', to: 'b' }, { from: 'c', to: 'd' }]);
  assert.equal(r.dsl, dsl + 'a -> b\nc -> d\n');
  assert.deepEqual(chainConnectInDsl(dsl, ['b', 'c'], [{ from: 'c', to: 'b' }]), { dsl, added: [] });
  assert.equal(chainConnectInDsl('x\n\n', ['a', 'b'], []).dsl, 'x\na -> b\n');
});

// ─── 読み込んだ図をまたぐ検索(HTML 版のツールバーの検索が、表示中でない図の当たりを並べる) ───
import { searchIdsInFiles } from '../label-core.mjs';

test('searchIdsInFiles: ID・ラベルに含む定義行と、from / to に含む接続行を図と行で返す(大文字小文字を区別しない)', () => {
  const files = [
    { path: 'spi_swc.sb', text: '# SpiDrv の構成\r\nblock SpiDrv "SPI Driver" at 1,1 size 4x2\r\nblock app "App" at 8,1 size 4x2\r\napp -> SpiDrv "spidrv"\r\n' },
    { path: 'can_swc.sb', text: 'block can "Can" at 1,1 size 4x2\n' },
    { path: 'shared/common.sb', text: 'block os "OS" at 1,1 size 4x2\nnote n1 "spidrv を使う" at 1,5 size 6x2\n' },
  ];
  assert.deepEqual(searchIdsInFiles(files, 'spidrv').map(h => [h.path, h.line, h.kind, h.id]),
    [['spi_swc.sb', 2, 'def', 'SpiDrv'], ['spi_swc.sb', 4, 'ref', 'SpiDrv'], ['shared/common.sb', 2, 'def', 'n1']]);
  assert.equal(searchIdsInFiles(files, 'SpiDrv')[1].text, 'app -> SpiDrv "spidrv"');   // 行末の \r は含めない
  assert.deepEqual(searchIdsInFiles(files, 'driver').map(h => [h.path, h.line]), [['spi_swc.sb', 2]]);   // ラベルで当たる
  assert.deepEqual(searchIdsInFiles(files, '  '), []);
  assert.deepEqual(searchIdsInFiles(files, 'nothing'), []);
});

test('renameIdInDsl: ラベル全体が旧 ID と同じなら表示名も新 ID に揃え、ラベルの一部に含むだけなら触れない', () => {
  assert.equal(renameIdInDsl('block SpiDrv "SpiDrv" at 1,1 size 4x2\nSpiDrv -> b', 'SpiDrv', 'SpiMasterDrv'),
    'block SpiMasterDrv "SpiMasterDrv" at 1,1 size 4x2\nSpiMasterDrv -> b');
  assert.equal(renameIdInDsl('  group  g1  "g1" at 1,1 size 4x2', 'g1', 'Grp'), '  group  Grp  "Grp" at 1,1 size 4x2');
  assert.equal(renameIdInDsl('block SpiDrv "SpiDrv 本体" at 1,1 size 4x2', 'SpiDrv', 'X'), 'block X "SpiDrv 本体" at 1,1 size 4x2');
  assert.equal(renameIdInDsl('block a "A" at 1,1 size 4x2\nblock b "a" at 5,1 size 4x2', 'a', 'z'), 'block z "A" at 1,1 size 4x2\nblock b "a" at 5,1 size 4x2');
});

// ─── プロパティ欄の ID 欄: 普段は畳んで今の ID だけ見せ、名前が無いときと利用者が開いたときだけ開く(BLK-human-20260926-1010-2) ───
import { idFieldOpen } from '../label-core.mjs';

test('idFieldOpen: __new_ の ID か、ほかの図でも使う ID か、利用者が開いたままにしたときだけ開く', () => {
  assert.equal(idFieldOpen('SpiDrv', false, true), true);
  assert.equal(idFieldOpen('__new_3', false), true);
  assert.equal(idFieldOpen('SpiDrv', false), false);
  assert.equal(idFieldOpen('SpiDrv', true), true);
  assert.equal(idFieldOpen('new_x', false), false);
});

test('HTML 版と VSCode 拡張の ID 欄は畳める欄(details)で、ラベル欄より下にあり、開閉は core の idFieldOpen で決める', () => {
  const root = sbPath(new URL('../../../', import.meta.url));
  for (const f of ['stableblock.html', 'vscode-stableblock/src/extension.js']) {
    const src = sbRead(root + f, 'utf8');
    const box = src.indexOf('id="prop-id-box"'), inp = src.indexOf('id="prop-id"');
    assert.ok(box > 0 && box < inp, f + ': ID 欄が details の中に無い');
    assert.ok(src.slice(box, inp).includes('StableBlockLabel.idFieldOpen('), f + ': 開閉が idFieldOpen で決まっていない');
    assert.ok(src.lastIndexOf('setLabel(this.value)', box) > 0 || src.lastIndexOf('sLb(this.value)', box) > 0, f + ': ラベル欄が ID 欄より上に無い');
  }
});
