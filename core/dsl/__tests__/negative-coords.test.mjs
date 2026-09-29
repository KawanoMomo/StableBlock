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
import { keepPos } from '../../layout/layout-core.mjs';
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
