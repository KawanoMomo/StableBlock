// 原点より左上(座標が負)の group / block / note(BLK-porter-20260930-0509)。既存の図には原点より左上へはみ出した配置がある。
// 読んで描く(画面・SVG / PNG・Excel で欠けない)、接続も描く、本文は書き換えない(無変更の往復はバイト一致)、
// その行で「原点より左・上に出ている」と警告する。HTML 版・VSCode 拡張・check が core の同じ読み方をする。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { parseDSL, serializeDSL } from '../dsl-core.mjs';
import * as L from '../../label/label-core.mjs';
import { checkDiagram, findNegative, explainLine } from '../../check/check-core.mjs';
import { renderSvg, exportSvg, exportPngSize } from '../../render/render-core.mjs';
import { keepPos, noteFloors, posFloor, clampShift } from '../../layout/layout-core.mjs';
import { buildDrawingXml, shiftToOrigin } from '../../excel/emitter.js';
import { toMermaid } from '../../mermaid/mermaid-core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TEXT = [
  '@canvas width=320 height=200 grid=20',
  'group g "G" at -6,-2 size 8x5',
  'block a "A" at -2,1 size 5x3',
  'block b "B" at 6,1 size 5x3',
  'note n "N" at 12,-1 size 3x1',
  'a -> b',
  'n -> b',
].join('\n') + '\n';
const measure = t => L.estimateTextWidth(t, 10);

test('parseDSL: 負の座標の group / block / note を読み、エラーにしない。無変更の往復はバイト一致', () => {
  const p = parseDSL(TEXT);
  assert.deepEqual(p.errors, []);
  assert.deepEqual([p.groupMap.g.x, p.groupMap.g.y, p.blockMap.a.x, p.blockMap.a.y, p.noteMap.n.y], [-6, -2, -2, 1, -1]);
  assert.equal(p.connections.length, 2);
  assert.equal(serializeDSL(p), TEXT);
  // 動かすとその数字だけが変わる
  p.blockMap.a.x = -1;
  assert.equal(serializeDSL(p).split('\n')[2], 'block a "A" at -1,1 size 5x3');
});

test('checkDiagram: 負の座標はエラーでなく、その行に原点より左・上に出ている量を警告する。接続の ID 欠落も出ない', () => {
  const p = parseDSL(TEXT);
  const d = checkDiagram(p, TEXT.split('\n'), L.connectionPaths(p));
  assert.deepEqual(d.filter(x => x.level === 'error'), []);
  const neg = d.filter(x => /原点/.test(x.msg));
  assert.deepEqual(neg.map(x => [x.line, x.level, x.pick]), [[2, 'warn', ['g']], [3, 'warn', ['a']], [5, 'warn', ['n']]]);
  assert.match(neg[0].msg, /^group「g」は原点より左へ 6・上へ 2 グリッド出ている\(座標が負\)/);
  assert.match(neg[1].msg, /^block「a」は原点より左へ 2 グリッド出ている/);
  assert.match(neg[2].msg, /^note「n」は原点より上へ 1 グリッド出ている/);
  assert.deepEqual(findNegative(p.blocks).map(o => [o.item.id, o.left, o.top]), [['a', 2, 0]]);
  // 原点より右下だけの図には言わない
  const ok = parseDSL('block a "A" at 0,0 size 2x2\n');
  assert.deepEqual(checkDiagram(ok, ['block a "A" at 0,0 size 2x2']).filter(x => /原点/.test(x.msg)), []);
  // 書式の崩れた行の説明は、負の座標を「読めない」と言わない
  assert.doesNotMatch(explainLine('block a "A" at -2,1 sise 5x3'), /at X,Y\(/);
});

test('drawArea: 描く範囲は @canvas に、原点より左・上の要素の分を足したもの(右・下は広げない)', () => {
  assert.deepEqual(L.drawArea(parseDSL(TEXT)), { x: -120, y: -40, width: 440, height: 240 });
  assert.deepEqual(L.drawArea(parseDSL('@canvas width=320 height=200 grid=20\nblock a "A" at 30,30 size 2x2\n')), { x: 0, y: 0, width: 320, height: 200 });
});

test('renderSvg / exportSvg / exportPngSize: 負の座標の要素が描く範囲に入り、接続も描かれる', () => {
  const p = parseDSL(TEXT);
  const svg = exportSvg(p, L, measure);
  assert.match(svg, /^<svg width="440" height="240" viewBox="-120 -40 440 240"/);
  assert.match(svg, /<g data-type="group" data-id="g"><rect x="-120" y="-40"/);
  assert.match(svg, /<g data-type="block" data-id="a"><rect x="-40" y="20"/);
  assert.match(svg, /<g data-type="note" data-id="n"><rect x="240" y="-20"/);
  assert.equal((svg.match(/marker-end=/g) || []).length, 2);
  assert.deepEqual(exportPngSize(L.drawArea(p)), { width: 880, height: 480 });
  // 画面(倍率・グリッド)も同じ範囲
  const screen = renderSvg(p, { zoom: 2, grid: true }, L, measure);
  assert.match(screen, /^<svg width="880" height="480" viewBox="-120 -40 440 240"/);
  assert.match(screen, /<rect x="-120" y="-40" width="440" height="240" fill="url\(#gd\)"\/>/);
  // 負の座標が無い図は今までどおり
  assert.match(exportSvg(parseDSL('@canvas width=320 height=200\nblock a "A" at 1,1 size 2x2\n'), L, measure), /^<svg width="320" height="200" viewBox="0 0 320 200"/);
});

test('Excel: 負の座標の図は全体を同じ量だけ右下へずらして置く(シートの外に置かない)。接続・note も入る', () => {
  const p = parseDSL(TEXT);
  const s = shiftToOrigin(p);
  assert.deepEqual([s.groupMap.g.x, s.groupMap.g.y, s.blockMap.a.x, s.blockMap.a.y, s.blockMap.b.x, s.noteMap.n.y], [0, 0, 4, 3, 12, 1]);
  assert.equal(p.blockMap.a.x, -2, '元の図は変えない');
  const xml = buildDrawingXml(p, { L, measure });
  const offs = [...xml.matchAll(/<(?:a:off|xdr:pos) x="(-?\d+)" y="(-?\d+)"/g)].map(m => [+m[1], +m[2]]);
  assert.ok(offs.length >= 5, 'shapes: ' + offs.length);
  for (const [x, y] of offs) assert.ok(x >= 0 && y >= 0, `シートの外: ${x},${y}`);
  assert.equal((xml.match(/<xdr:cxnSp[ >]/g) || []).length, 2);
  for (const t of ['>G<', '>A<', '>B<', '>N<']) assert.ok(xml.includes(t), t);
  assert.equal(shiftToOrigin(parseDSL('block a "A" at 1,1 size 2x2\n')).blockMap.a.x, 1);
});

test('Mermaid: 負の座標の図も要素と接続が欠けない', () => {
  const out = toMermaid(parseDSL(TEXT));
  const text = typeof out === 'string' ? out : out.text;
  for (const s of ['G', 'A', 'B', 'N']) assert.match(text, new RegExp(`"${s}"`));
  assert.match(text, /a\s*-->\s*b/);
});

test('keepPos: GUI で動かしても原点より左・上へは出さないが、元から出ている要素は元の位置まで置ける', () => {
  assert.equal(keepPos(-1, 2), 0);
  assert.equal(keepPos(-1, -2), -1);
  assert.equal(keepPos(-3, -2), -2);
  assert.equal(keepPos(4, -2), 4);
});

// BLK-owner-20260930-0608-1: 止める位置は「動かし始めの位置」でなく「読み込んだときの位置」。group と中身は同じ量だけ動く
test('noteFloors: 本文に出た原点より左・上の位置を覚え、右へ動かした後も下限は読み込んだ位置のまま', () => {
  const loaded = parseDSL('@canvas width=320 height=200 grid=20\ngroup g "G" at -2,1 size 12x6\nblock k "K" at 3,2 size 4x2\nblock a "A" at -4,-1 size 2x2\nnote n "N" at 1,-3 size 2x1\n');
  const f0 = noteFloors({}, loaded);
  assert.deepEqual(f0, { 'block:a': { x: -4, y: -1 }, 'group:g': { x: -2, y: 0 }, 'note:n': { x: 0, y: -3 } });
  // a を右へ 1(-3,-1)動かした本文を読んでも下限は -4 のまま
  const moved = parseDSL('@canvas width=320 height=200 grid=20\nblock a "A" at -3,-1 size 2x2\n');
  const f1 = noteFloors(f0, moved);
  assert.equal(f1, f0, '変わらなければ同じ控えを返す');
  assert.deepEqual(f1['block:a'], { x: -4, y: -1 });
  assert.deepEqual(posFloor(f1, 'block', 'a', -3, -1), { x: -4, y: -1 });
  // 控えに無い(0 以上で読んだ)要素の下限は原点
  assert.deepEqual(posFloor(f1, 'block', 'k', 3, 2), { x: 0, y: 0 });
  // 本文欄でさらに左へ書けば、その位置が新しい下限
  const f2 = noteFloors(f1, parseDSL('@canvas width=320 height=200 grid=20\nblock a "A" at -7,-1 size 2x2\n'));
  assert.deepEqual(f2['block:a'], { x: -7, y: -1 });
  assert.deepEqual(f1['block:a'], { x: -4, y: -1 }, '元の控えは書き換えない');
});

test('clampShift: group と中身は同じ量だけ動き、どれかが下限に当たれば全員が止まる', () => {
  const floors = noteFloors({}, parseDSL('@canvas width=320 height=200 grid=20\ngroup g "G" at -2,1 size 12x6\nblock k "K" at 3,2 size 4x2\n'));
  const items = [{ type: 'group', id: 'g', x: -2, y: 1 }, { type: 'block', id: 'k', x: 3, y: 2 }];
  // 左へ 3: 枠は -2 が下限なので動けない → 中身も動かない
  assert.deepEqual(clampShift(items, -3, 0, floors), { dx: 0, dy: 0 });
  // 上へ 5: k(y=2、下限 0)が 2 で止まり、枠(y=1、下限 0)は 1 で止まる → 全員 1
  assert.deepEqual(clampShift(items, 0, -5, floors), { dx: 0, dy: -1 });
  // 右・下へは制限しない
  assert.deepEqual(clampShift(items, 4, 3, floors), { dx: 4, dy: 3 });
  // 右へ 2 動かした後(g -0、k 5)は、左へ読み込んだ位置まで(2)戻せるが、それより先へは出ない
  const after = [{ type: 'group', id: 'g', x: 0, y: 1 }, { type: 'block', id: 'k', x: 5, y: 2 }];
  assert.deepEqual(clampShift(after, -1, 0, floors), { dx: -1, dy: 0 });
  assert.deepEqual(clampShift(after, -9, 0, floors), { dx: -2, dy: 0 });
  // 0 以上で読んだ要素は負にならない
  assert.deepEqual(clampShift([{ type: 'block', id: 'k', x: 3, y: 2 }], -9, -9, floors), { dx: -3, dy: -2 });
});

test('HTML 版と VSCode 拡張は、移動(ドラッグ・矢印キー・group の中身)を clampShift の共通量で動かす', () => {
  for (const f of ['stableblock.html', 'vscode-stableblock/src/extension.js']) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    assert.doesNotMatch(src, /keepPos\((it\.sx|it\.x|b\.x|g\.x)[^)]*,(it\.sx|it\.x|b\.x|g\.x)\)/, f + ': 要素ごとに「動かし始めの位置」で止めている');
    assert.match(src, /clampShift\(/, f);
    assert.match(src, /noteFloors\(/, f);
  }
});

test('HTML 版と VSCode 拡張の parser・座標の書換・貼付は負の座標を読む', () => {
  for (const f of ['stableblock.html', 'vscode-stableblock/src/extension.js']) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    assert.doesNotMatch(src, /at\\{1,2}s\+\(\[\\{1,2}d\.\]\+\),/, f + ': at X,Y が負を受けない parser / 貼付が残っている');
    assert.doesNotMatch(src, /at\\{2,4}s\+\)?\[\\{2,4}d\.\]\+,/, f + ': 座標の書換が負を受けない');
    assert.doesNotMatch(src, /Math\.max\(0,(it\.sx|nx|it\.x|b\.x|g\.x)\b/, f + ': 動かすと負の座標が 0 へ飛ぶ');
  }
  // 拡張の Webview の parser が core と同じに読む
  const require_ = createRequire(import.meta.url);
  const src = readFileSync(join(ROOT, 'vscode-stableblock', 'src', 'extension.js'), 'utf8');
  const fakeRequire = m => (m === 'vscode' ? {} : require_(m));
  const mod = { exports: {} };
  const fns = new Function('require', 'module', 'exports', '__dirname', `${src}\nreturn { getWebviewContent };`)(fakeRequire, mod, mod.exports, join(ROOT, 'vscode-stableblock', 'src'));
  const html = fns.getWebviewContent('@canvas width=400\n', null);
  const start = html.indexOf('function parseDSL(t){');
  const vs = new Function('window', `${html.slice(start, html.indexOf('\n}\n', start) + 2)}\nreturn parseDSL;`)({ StableBlockLabel: L });
  const b = vs(TEXT), a = parseDSL(TEXT);
  assert.deepEqual(b.errors, []);
  for (const k of ['blocks', 'groups', 'notes']) assert.deepEqual(b[k].map(x => [x.id, x.x, x.y]), a[k].map(x => [x.id, x.x, x.y]), k);
  // 拡張が手で並べる公開一覧に、描画・検査・Excel が使う関数がある
  for (const n of ['drawArea', 'keepPos', 'shiftToOrigin']) assert.match(html, new RegExp(`window\\.StableBlock\\w+ = \\{[^}]*\\b${n}\\b`), n);
});
