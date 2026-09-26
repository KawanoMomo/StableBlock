// 書き出しが属性を黙って落とさないことの検査(当て方の検査)。
// parser が読む全属性(core/dsl の ATTRS)について、既定と違う値にすると書き出しの中身が変わるか、書き出せなかったものの一覧が変わること。
// どちらも変わらない属性は、利用者の図から知らせ無しに消える。parser に属性を足したら、ここの SAMPLES に値を足し、
// 各書き出しで「載せる」か「一覧で知らせる」かを決める(決めないと赤)。画面でも描き分けない属性だけを SAME に理由付きで置ける。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDSL, ATTRS } from '../dsl-core.mjs';
import { buildDrawingXml, listXlsxDrops } from '../../excel/emitter.js';
import { toMermaid } from '../../mermaid/mermaid-core.mjs';

const BASE = {
  canvas: '@canvas',
  group: 'group g "G" at 0,0 size 30x12',
  block: 'block a "A" at 1,1 size 6x3',
  note: 'note n "N" at 1,7 size 6x2',
  conn: 'a -> b "L"',
};
const REST = ['block b "B" at 12,1 size 6x3'];

// 既定と見た目が違う値(既定と同じ見た目の値は入れない: route=curved は既定の曲線、lpos=center は Excel の中点と同じ)
const SAMPLES = {
  block: { color: ['#FF0000'], textColor: ['#00FF00'], borderColor: ['#0000FF'], round: ['0', '20'], style: ['dashed', 'bold'] },
  group: { color: ['#FF0000'], borderColor: ['#0000FF'] },
  note: { color: ['#FF0000'], textColor: ['#00FF00'], borderColor: ['#0000FF'], round: ['0', '20'], style: ['dashed', 'bold'] },
  conn: { color: ['#FF0000'], style: ['dashed'], width: ['3'], route: ['straight', 'ortho'], lpos: ['right', 'left', 'top', 'bottom'] },
  canvas: { width: ['500'], height: ['300'], grid: ['10'], route: ['straight', 'ortho'], grow: ['off'] },
};

const NOTE_STYLE = '画面でも note の style= は描き分けない(常に破線。BLK-porter-20260926-1205-2)';
const EXPORTERS = {
  Excel: {
    run: p => ({ out: buildDrawingXml(p), dropped: listXlsxDrops(p) }),
    same: {
      'note.style': NOTE_STYLE,
      'canvas.width': 'Excel のシートに画布の枠は無い(図形の位置・大きさはそのまま)',
      'canvas.height': 'Excel のシートに画布の枠は無い(図形の位置・大きさはそのまま)',
      'canvas.grow': '編集中に画布を広げるかどうか。図の見た目に効かない',
    },
  },
  Mermaid: {
    run: p => { const r = toMermaid(p); return { out: r.text, dropped: r.dropped }; },
    same: {
      'note.style': NOTE_STYLE,
      'note.round': 'note は旗形のノードで写す(形そのものを Mermaid の注釈の形にしている)',
      'canvas.width': '「座標・大きさ」の行で知らせる(Mermaid は自動配置)',
      'canvas.height': '「座標・大きさ」の行で知らせる(Mermaid は自動配置)',
      'canvas.grid': '「座標・大きさ」の行で知らせる(Mermaid は自動配置)',
      'canvas.grow': '編集中に画布を広げるかどうか。図の見た目に効かない',
    },
  },
};

const keyOf = re => re.source.split('=')[0];
function source(type, extra) {
  return [...Object.entries(BASE).map(([t, line]) => (t === type ? `${line} ${extra}` : line)), ...REST].join('\n');
}

test('export-fidelity: parser の全属性に見本の値がある(属性を足したら書き出しの当て方も決める)', () => {
  for (const [type, fields] of Object.entries(ATTRS)) {
    for (const [field] of fields) {
      assert.ok(SAMPLES[type]?.[field]?.length, `${type}.${field}: SAMPLES に既定と違う値を足し、Excel / Mermaid で載せるか知らせるかを決める`);
    }
  }
});

test('export-fidelity: 基準の図は parser がエラー無しで読む', () => {
  const p = parseDSL(source(null, ''));
  assert.deepEqual(p.errors, []);
  assert.equal(p.connections.length, 1);
});

for (const [name, ex] of Object.entries(EXPORTERS)) {
  test(`export-fidelity: ${name} は全属性を載せるか、書き出せなかったものの一覧で知らせる`, () => {
    const base = ex.run(parseDSL(source(null, '')));
    const silent = [];
    for (const [type, fields] of Object.entries(ATTRS)) {
      for (const [field, re] of fields) {
        if (ex.same[`${type}.${field}`]) continue;
        for (const v of SAMPLES[type][field]) {
          const p = parseDSL(source(type, `${keyOf(re)}=${v}`));
          assert.deepEqual(p.errors, [], `${type}.${field}=${v} の見本が読めない`);
          const r = ex.run(p);
          if (r.out === base.out && JSON.stringify(r.dropped) === JSON.stringify(base.dropped)) silent.push(`${type} ${keyOf(re)}=${v}`);
        }
      }
    }
    assert.deepEqual(silent, [], `${name} で知らせ無しに消える属性`);
  });

  test(`export-fidelity: ${name} の SAME は parser にある属性だけを指す`, () => {
    for (const k of Object.keys(ex.same)) {
      const [type, field] = k.split('.');
      assert.ok((ATTRS[type] || []).some(([f]) => f === field), `${k} は parser に無い`);
    }
  });
}
