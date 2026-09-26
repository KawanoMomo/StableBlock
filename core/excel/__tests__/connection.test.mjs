import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConnectionShape } from '../emitter.js';

test('buildConnectionShape: single-direction arrow', () => {
  const conn = {
    from: 'a', to: 'b', label: '',
    color: '#64748B', style: 'solid', width: 1.5, bidir: false
  };
  const endpoints = { x1: 100000, y1: 100000, x2: 500000, y2: 100000 };
  const xml = buildConnectionShape(conn, 0, endpoints, 1);
  assert.ok(xml.includes('name="conn:0"'));
  assert.ok(xml.includes('straightConnector1'));
  assert.ok(xml.includes('<a:tailEnd type="triangle"/>'));
  assert.ok(!xml.includes('<a:headEnd'));
  assert.ok(xml.includes('val="64748B"'));
});

test('buildConnectionShape: bidirectional has both arrowheads', () => {
  const conn = {
    from: 'a', to: 'b', label: '',
    color: '#000000', style: 'solid', width: 1, bidir: true
  };
  const endpoints = { x1: 0, y1: 0, x2: 100000, y2: 0 };
  const xml = buildConnectionShape(conn, 0, endpoints, 1);
  assert.ok(xml.includes('<a:headEnd type="triangle"/>'));
  assert.ok(xml.includes('<a:tailEnd type="triangle"/>'));
});

test('buildConnectionShape: dashed style', () => {
  const conn = {
    from: 'a', to: 'b', label: '',
    color: '#000000', style: 'dashed', width: 1, bidir: false
  };
  const endpoints = { x1: 0, y1: 0, x2: 100000, y2: 0 };
  const xml = buildConnectionShape(conn, 0, endpoints, 1);
  assert.ok(xml.includes('<a:prstDash val="dash"/>'));
});

test('buildConnectionShape: width converts to EMU (1.5 px = 14288)', () => {
  const conn = {
    from: 'a', to: 'b', label: '',
    color: '#000000', style: 'solid', width: 1.5, bidir: false
  };
  const endpoints = { x1: 0, y1: 0, x2: 100000, y2: 0 };
  const xml = buildConnectionShape(conn, 0, endpoints, 1);
  assert.ok(xml.includes('w="14288"'));
});

test('buildConnectionShape: reversed coords use flipH', () => {
  const conn = {
    from: 'a', to: 'b', label: '',
    color: '#000000', style: 'solid', width: 1, bidir: false
  };
  // x1 > x2 → flipH=true
  const endpoints = { x1: 500000, y1: 0, x2: 100000, y2: 0 };
  const xml = buildConnectionShape(conn, 0, endpoints, 1);
  assert.ok(xml.includes('flipH="true"'));
});

import { buildConnectionLabel } from '../emitter.js';

test('buildConnectionLabel: places textbox at midpoint', () => {
  const xml = buildConnectionLabel(
    { from: 'a', to: 'b', label: 'request' },
    0,
    { x1: 100000, y1: 100000, x2: 500000, y2: 100000 },
    99
  );
  assert.ok(xml.includes('name="connlabel:0"'));
  assert.ok(xml.includes('request'));
  // midX = 300000 - 250000 (textbox half width) = 50000
  assert.ok(xml.includes('x="50000"'));
});

test('buildConnectionLabel: escapes special chars in label', () => {
  const xml = buildConnectionLabel(
    { from: 'a', to: 'b', label: '<X & Y>' },
    0,
    { x1: 0, y1: 0, x2: 100000, y2: 0 },
    99
  );
  assert.ok(xml.includes('&lt;X &amp; Y&gt;'));
  assert.ok(!xml.includes('<X & Y>'));
});

test('buildConnectionLabel: includes font specs', () => {
  const xml = buildConnectionLabel(
    { from: 'a', to: 'b', label: 'request' },
    0,
    { x1: 100000, y1: 100000, x2: 500000, y2: 100000 },
    99
  );
  assert.ok(xml.includes('<a:latin typeface="Calibri"/>'));
  assert.ok(xml.includes('<a:ea typeface="Yu Gothic UI"/>'));
});

test('buildConnectionLabel: DSL 2-char \\n splits label', () => {
  const xml = buildConnectionLabel(
    { from: 'a', to: 'b', label: 'A\\nB' },
    0,
    { x1: 0, y1: 0, x2: 100000, y2: 0 },
    99
  );
  const pCount = (xml.match(/<a:p>/g) || []).length;
  assert.equal(pCount, 2);
});

// Excel の接続線は画面と同じ線の形(曲線・直角・直線)で出す。ラベルは中点だけなので lpos= は接続ごとに知らせる
// (BLK-builder-20260926-1230-1 / BLK-porter-20260926-1205-1)
import { listXlsxDrops as xlsxDrops, buildDrawingXml as drawingXml, connectorGeometry, xlsxRoute } from '../emitter.js';
import { parseDSL as parseSb } from '../../dsl/dsl-core.mjs';

const src3 = (canvas, conns) => [canvas, 'block a "A" at 1,1 size 4x2', 'block b "B" at 8,1 size 4x2', 'block c "C" at 1,6 size 4x2', ...conns].join('\n');

test('listXlsxDrops: 線の形は載せるので知らせない。lpos= は接続ごとに要素 ID と値で知らせ、lpos=center は知らせない', () => {
  assert.deepEqual(xlsxDrops(parseSb(src3('@canvas', ['a -> b "x" lpos=top', 'b -> c route=ortho', 'a -> c "y" route=straight lpos=center']))), [
    '接続 a -> b の lpos=top(Excel ではラベルを線の中点に置く)',
  ]);
  assert.deepEqual(xlsxDrops(parseSb(src3('@canvas route=straight', ['a -> b "x"', 'b -> c']))), []);
  assert.deepEqual(xlsxDrops(parseSb(src3('@canvas route=ortho', ['a -> b', 'b -> zz', 'c --> a "z" lpos=left']))), [
    '接続 b -> zz(zz が図に無い)',
    '接続 c --> a の lpos=left(Excel ではラベルを線の中点に置く)',
  ]);
});

test('xlsxRoute: 接続の route= → @canvas の route= → 曲線(画面の connRoute と同じ順)', () => {
  assert.equal(xlsxRoute({}, {}), 'curved');
  assert.equal(xlsxRoute({}, { route: 'ortho' }), 'ortho');
  assert.equal(xlsxRoute({ route: 'straight' }, { route: 'ortho' }), 'straight');
  assert.equal(xlsxRoute({ route: 'zigzag' }, {}), 'curved');
});

test('buildDrawingXml: 接続の線の形を既定形で出す(曲線 = curvedConnector3、直角 = bentConnector3、直線 = straightConnector1)', () => {
  const prsts = xml => [...xml.matchAll(/<xdr:cxnSp[\s\S]*?prst="(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(prsts(drawingXml(parseSb(src3('@canvas', ['a -> b', 'a -> c route=ortho', 'b -> c route=straight'])))),
    ['curvedConnector3', 'bentConnector3', 'straightConnector1']);
  assert.deepEqual(prsts(drawingXml(parseSb(src3('@canvas route=ortho', ['a -> b', 'a -> c route=curved'])))), ['bentConnector3', 'curvedConnector3']);
});

// 既定形は (0,0) から右向きに出て (w,h) へ右向きに入る。flip は回す前、回転は中心まわり(90° = y 下向きで時計回り)。
// 描いた後の始点・終点と出入りの向きが端点・辺と一致することを、全部の向きで確かめる
function placed(geo) {
  const { x, y, cx, cy } = geo.xfrm;
  const c = { x: x + cx / 2, y: y + cy / 2 };
  const local = (px, py) => ({ u: (geo.flipH ? cx - px : px) - cx / 2, v: (geo.flipV ? cy - py : py) - cy / 2 });
  const turn = ({ u, v }) => (geo.rot ? { x: c.x - v, y: c.y + u } : { x: c.x + u, y: c.y + v });
  const dir = geo.flipH ? -1 : 1;
  const heading = geo.rot ? { x: 0, y: dir } : { x: dir, y: 0 };
  return { start: turn(local(0, 0)), end: turn(local(cx, cy)), heading };
}
const HEAD = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, bottom: { x: 0, y: 1 }, top: { x: 0, y: -1 } };

test('connectorGeometry: 曲線・直角は始点の辺の向きに出て終点に着く(左右 4 通り・上下 4 通り)', () => {
  const cases = [
    { fs: 'right', ep: { x1: 100, y1: 100, x2: 500, y2: 300 } },
    { fs: 'right', ep: { x1: 100, y1: 300, x2: 500, y2: 100 } },
    { fs: 'left', ep: { x1: 500, y1: 100, x2: 100, y2: 300 } },
    { fs: 'left', ep: { x1: 500, y1: 300, x2: 100, y2: 100 } },
    { fs: 'bottom', ep: { x1: 100, y1: 100, x2: 300, y2: 500 } },
    { fs: 'bottom', ep: { x1: 300, y1: 100, x2: 100, y2: 500 } },
    { fs: 'top', ep: { x1: 100, y1: 500, x2: 300, y2: 100 } },
    { fs: 'top', ep: { x1: 300, y1: 500, x2: 100, y2: 100 } },
  ];
  for (const route of ['curved', 'ortho']) {
    for (const { fs, ep } of cases) {
      const geo = connectorGeometry(ep, route, fs);
      const p = placed(geo);
      const tag = `${route} ${fs} ${JSON.stringify(ep)}`;
      assert.deepEqual(p.start, { x: ep.x1, y: ep.y1 }, `${tag}: 始点`);
      assert.deepEqual(p.end, { x: ep.x2, y: ep.y2 }, `${tag}: 終点`);
      assert.deepEqual(p.heading, HEAD[fs], `${tag}: 出る向き`);
      // anchor は画面上の外接矩形(Excel は 90° 回した図形の anchor を回した後の箱として読む)
      assert.deepEqual(geo.anchor, { x: 100, y: 100, cx: Math.abs(ep.x2 - ep.x1), cy: Math.abs(ep.y2 - ep.y1) }, `${tag}: anchor`);
    }
  }
});

test('buildDrawingXml: 図形の id は 2 から振り、接続線の接着先(stCxn / endCxn)はその図形の id を指す', () => {
  const xml = drawingXml(parseSb(src3('@canvas', ['a -> b', 'c -> a'])));
  const ids = [...xml.matchAll(/<xdr:cNvPr id="(\d+)" name="([^"]+)"/g)].map(m => [m[2], +m[1]]);
  assert.equal(Math.min(...ids.map(([, id]) => id)), 2);
  const idOf = Object.fromEntries(ids);
  const glue = [...xml.matchAll(/<a:stCxn id="(\d+)" idx="\d"\/><a:endCxn id="(\d+)"/g)].map(m => [+m[1], +m[2]]);
  assert.deepEqual(glue, [[idOf['block:a'], idOf['block:b']], [idOf['block:c'], idOf['block:a']]]);
});
