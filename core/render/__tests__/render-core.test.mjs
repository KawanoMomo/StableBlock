// core/render: 画面と書き出し(SVG / PNG)の描画。書き出しは本文だけで決まり、画面の状態(選択・ハンドル・スナップガイド・
// グリッド・検索や「未接続を薄く」の薄め・注釈の表示切替・表示倍率)を持ち込まない。HTML 版と VSCode 拡張は同じ関数を使う。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as L from '../../label/label-core.mjs';
import { parseDSL } from '../../dsl/dsl-core.mjs';
import { renderSvg, exportSvg, viewExportSvg, exportPngSize, matchesSearchItem, searchMatches, nextMatch, linkedIds, unlinkedBlocks } from '../render-core.mjs';
import { buildRenderCoreBrowser } from '../../excel/build-browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const norm = (s) => s.replace(/\r\n/g, '\n');
const measure = (t) => L.estimateTextWidth(t, 10);

const SRC = [
  '@canvas width=960 height=520 grid=20',
  'group g1 "Driver" at 1,1 size 20x10',
  'block ui "UI" at 2,3 size 6x3',
  'block logic "Logic\\nCore" at 12,3 size 6x3',
  'block lone "Lone" at 30,3 size 6x3',
  'block solo "Solo" at 40,3 size 4x3',
  'note memo "メモ" at 30,12 size 8x2',
  'ui -> logic "call"',
  'memo -> lone',
].join('\n');
const parsed = parseDSL(SRC);

test('render-core.browser.js is up to date (drift detection)', () => {
  assert.equal(norm(read('core/render/render-core.browser.js')), norm(buildRenderCoreBrowser(norm(read('core/render/render-core.mjs')))),
    'Run `npm run build:browser` to regenerate render-core.browser.js');
});

test('unlinkedBlocks: 接続が 1 本も無い block だけ(注釈の破線も接続に数える)。画面の「◎ 未接続」が薄くするのと同じ', () => {
  assert.deepEqual(unlinkedBlocks(parsed).map(b => b.id), ['solo']);
  assert.deepEqual([...linkedIds(parsed)].sort(), ['logic', 'lone', 'memo', 'ui']);
  const s = renderSvg(parsed, { highlight: true, interactive: false }, L, measure);
  assert.deepEqual([...s.matchAll(/<g data-type="block" data-id="([^"]+)" opacity="0.15"/g)].map(m => m[1]), ['solo']);
});

test('書き出しの SVG は @canvas の寸法で、選択枠・ハンドル・グリッド・薄めを含まない', () => {
  const svg = exportSvg(parsed, L, measure);
  assert.match(svg, /^<svg width="960" height="520" viewBox="0 0 960 520"/);
  assert.doesNotMatch(svg, /data-resize/);
  assert.doesNotMatch(svg, /url\(#gd\)|<pattern/);
  assert.doesNotMatch(svg, /opacity="0\.(15|2)"/);
  assert.doesNotMatch(svg, /cursor:/);
  assert.doesNotMatch(svg, /#6366F1|rgba\(99,102,241/);          // 選択の枠・影
  assert.match(svg, /data-id="memo"/);                            // 注釈は本文どおり入る
  assert.match(svg, />Logic<\/text>.*>Core<\/text>/);             // 名前の \n は改行
});

test('画面の状態(選択・倍率・検索・未接続を薄く・注釈を隠す・スナップガイド)を変えても書き出しはバイト一致', () => {
  const base = exportSvg(parsed, L, measure);
  const views = [
    { zoom: 0.91, sel: [{ type: 'block', id: 'ui' }], grid: true },
    { zoom: 1.25, sel: [{ type: 'block', id: 'ui' }, { type: 'block', id: 'logic' }], highlight: true, grid: true },
    { zoom: 1, search: 'ui', showAnnotations: false, snapGuides: [{ x1: 0, y1: 60, x2: 960, y2: 60 }], grid: true },
  ];
  for (const v of views) {
    const screen = renderSvg(parsed, v, L, measure);
    assert.notEqual(screen, base, '画面は状態を映す');
    assert.equal(exportSvg(parsed, L, measure), base);
  }
});

test('PNGをコピー(viewExportSvg)は見たまま: 薄め・注釈を隠すは画面どおり、選択・ハンドル・グリッド・倍率・スナップガイドは入らない', () => {
  const base = exportSvg(parsed, L, measure);
  // 薄めも注釈を隠すことも無い画面では書き出しとバイト一致(選択・倍率・グリッドを変えても)
  assert.equal(viewExportSvg(parsed, { zoom: 1.25, sel: [{ type: 'block', id: 'ui' }], grid: true }, L, measure), base);
  assert.equal(viewExportSvg(parsed, null, L, measure), base);
  // 「◎ 未接続」: 画面と同じ要素が同じ不透明度で薄まる(大きさは @canvas の寸法のまま)
  const hlView = { zoom: 1.25, sel: [{ type: 'block', id: 'ui' }], grid: true, highlight: true, snapGuides: [{ x1: 0, y1: 60, x2: 960, y2: 60 }] };
  const hl = viewExportSvg(parsed, hlView, L, measure);
  const dims = s => [...s.matchAll(/data-id="([^"]+)"[^>]*opacity="(0\.(?:15|2))"/g)].map(m => m[1] + ':' + m[2]);
  assert.deepEqual(dims(hl), dims(renderSvg(parsed, hlView, L, measure)));
  assert.deepEqual(dims(hl), ['solo:0.15']);
  assert.match(hl, /^<svg width="960" height="520" viewBox="0 0 960 520"/);
  assert.doesNotMatch(hl, /data-resize|url\(#gd\)|<pattern|cursor:|#6366F1|rgba\(99,102,241|<line /);
  // 検索の薄め・注釈を隠すも画面どおり
  const sv = viewExportSvg(parsed, { search: 'ui', showAnnotations: false }, L, measure);
  assert.match(sv, /data-id="logic"[^>]*opacity="0.2"/);
  assert.doesNotMatch(sv, /data-id="memo"/);
  // 書き出し(SVG / PNG / 透過PNG)は変わらず本文だけ
  assert.equal(exportSvg(parsed, L, measure), base);
});

test('HTML 版と VSCode 拡張の表示中の図 1 枚の書き出し(SVG / PNG / 透過PNG / PNGをコピー)は画面の薄め・注釈の表示を viewExportSvg に渡す', () => {
  const fns = { 'stableblock.html': ['exportSVG', 'exportPNG', 'exportPNGTransparent', 'copyPNG'], 'vscode-stableblock/src/extension.js': ['exportSVG', 'exportPNG', 'exportPNGT', 'copyPNG'] };
  for (const f of Object.keys(fns)) {
    const src = read(f);
    for (const fn of fns[f]) {
      const body = src.slice(src.indexOf(`function ${fn}(`));
      assert.match(body.slice(0, body.indexOf('\n')), /viewSvgText\(\)/, `${f} の ${fn}`);
    }
    const view = src.slice(src.indexOf('function viewSvgText'));
    assert.match(view.slice(0, view.indexOf('\n')), /StableBlockRender\.viewExportSvg\(parsed,\{highlight.*search:.*showAnnotations:?/, f + ' の見たまま');
  }
  assert.match(read('vscode-stableblock/src/extension.js'), /renderSvg, exportSvg, viewExportSvg \}/);
  // 一括書き出し(画面に出ていない図も含む)は本文だけの絵のまま
  const html = read('stableblock.html');
  assert.match(html, /zip\.file\(name,exportSvgText\(p\)\)/);
  assert.match(html, /await pngCanvas\(fmt==='png-transparent',p\)/);
});

test('画面の描画は状態を映す(倍率・選択のハンドル・グリッド・薄め)', () => {
  const s = renderSvg(parsed, { zoom: 1.25, sel: [{ type: 'block', id: 'ui' }], grid: true, highlight: true }, L, measure);
  assert.match(s, /^<svg width="1200" height="650"/);
  assert.equal((s.match(/data-resize=/g) || []).length, 8);
  assert.match(s, /fill="url\(#gd\)"/);
  assert.match(s, /data-id="solo" style="cursor:grab" opacity="0.15"/);
  const hidden = renderSvg(parsed, { showAnnotations: false }, L, measure);
  assert.doesNotMatch(hidden, /data-id="memo"/);
  assert.ok(matchesSearchItem(parsed.connections[0], 'logic'));   // 接続は from / to でも当たる
});

test('PNG の画素数は @canvas の寸法 × 2(表示倍率に依らない)', () => {
  assert.deepEqual(exportPngSize(parsed.canvas), { width: 1920, height: 1040 });
});

test('HTML 版と VSCode 拡張は画面と書き出しを core/render で描き、画面の SVG を直列化しない', () => {
  for (const f of ['stableblock.html', 'vscode-stableblock/src/extension.js']) {
    const src = read(f);
    assert.match(src, /StableBlockRender\.renderSvg\(/, f + ' の画面');
    assert.match(src, /StableBlockRender\.exportSvg\(/, f + ' の書き出し');
    assert.match(src, /StableBlockRender\.exportPngSize\(/, f + ' の PNG');
    const exp = src.slice(src.indexOf('function exportSVG'), src.indexOf('function copyPNG'));
    assert.doesNotMatch(exp, /querySelector\('#(svg-wrap|wrap) svg'\)/, f + ' が画面の SVG を書き出している');
    assert.doesNotMatch(exp, /\bzoom\b|\bzm\b/, f + ' の書き出しが表示倍率に依る');
  }
  assert.match(read('vscode-stableblock/scripts/prepackage-core.js'), /"render", "render-core\.mjs"/);
});

test('検索: note も薄め、当たりを読み順に数え、Enter / Shift+Enter の移動先は端で回る', () => {
  const p = parseDSL([
    '@canvas width=960 height=520 grid=20',
    'block __new_2 "B" at 12,3 size 6x3',
    'note __new_3 "memo" at 1,12 size 8x2',
    'group __new_1 "G" at 1,1 size 20x10',
    'block keep "Keep" at 2,3 size 6x3',
    'note keepn "memo keep" at 12,12 size 8x2',
  ].join('\n'));
  const s = renderSvg(p, { search: '__new_' }, L, measure);
  assert.match(s, /data-type="note" data-id="keepn" style="cursor:grab" opacity="0.2"/);
  assert.match(s, /data-type="note" data-id="__new_3" style="cursor:grab">/);
  const m = searchMatches(p, '__new_');
  assert.deepEqual(m.map(x => x.id), ['__new_1', '__new_2', '__new_3']);
  assert.deepEqual(searchMatches(p, '__new_', { showAnnotations: false }).map(x => x.id), ['__new_1', '__new_2']);
  assert.deepEqual(searchMatches(p, '  '), []);
  assert.deepEqual(searchMatches(p, 'zzz'), []);
  assert.deepEqual(nextMatch(m, null, 1), { type: 'group', id: '__new_1' });
  assert.deepEqual(nextMatch(m, null, -1), { type: 'note', id: '__new_3' });
  assert.deepEqual(nextMatch(m, { type: 'block', id: '__new_2' }, 1), { type: 'note', id: '__new_3' });
  assert.deepEqual(nextMatch(m, { type: 'note', id: '__new_3' }, 1), { type: 'group', id: '__new_1' });
  assert.deepEqual(nextMatch(m, { type: 'group', id: '__new_1' }, -1), { type: 'note', id: '__new_3' });
  assert.deepEqual(nextMatch(m, { type: 'block', id: 'keep' }, 1), { type: 'group', id: '__new_1' });   // 直して外れた選択からは先頭へ
  assert.equal(nextMatch([], null, 1), null);
});

// note の style=: 書いていない note は注釈の破線枠(4,2)。書いた note は block と同じ規則で描く(BLK-porter-20260926-1205-2)
test('renderSvg: note は style= を書けば solid / dashed / bold で描き分け、書かなければ破線の注釈枠', () => {
  const src = [
    'note n0 "既定" at 1,1 size 6x2',
    'note n1 "実線" at 1,4 size 6x2 style=solid',
    'note n2 "破線" at 1,7 size 6x2 style=dashed',
    'note n3 "太線" at 1,10 size 6x2 style=bold',
  ].join('\n');
  const p = parseDSL(src);
  assert.equal(p.notes[0].style, null);
  assert.equal(p.notes[1].style, 'solid');
  const s = exportSvg(p, L, measure);
  const rect = id => s.match(new RegExp(`<g data-type="note" data-id="${id}"[^>]*><rect ([^>]*)/>`))[1];
  assert.match(rect('n0'), /stroke-width="1" stroke-dasharray="4,2"/);
  assert.doesNotMatch(rect('n1'), /stroke-dasharray/);
  assert.match(rect('n1'), /stroke-width="1"/);
  assert.match(rect('n2'), /stroke-dasharray="6,3"/);
  assert.match(rect('n3'), /stroke-width="2.5"/);
  assert.doesNotMatch(rect('n3'), /stroke-dasharray/);
});

test('marks(見比べる画面の印): 変わった要素に橙の破線枠、変わった接続に橙の太線。書き出し・印の無い画面には出ない', () => {
  const s = renderSvg(parsed, { interactive: false, marks: { items: ['logic', 'memo', 'g1'], conns: ['ui->logic', 'memo->lone'] } }, L, measure);
  assert.deepEqual([...s.matchAll(/<rect data-changed="([^"]+)"/g)].map(m => m[1]), ['g1', 'logic', 'memo']);
  assert.deepEqual([...s.matchAll(/data-changed-conn="([^"]+)"/g)].map(m => m[1]), ['ui-&gt;logic', 'memo-&gt;lone']);
  assert.doesNotMatch(renderSvg(parsed, { interactive: false }, L, measure), /data-changed/);
  assert.doesNotMatch(exportSvg(parsed, L, measure), /data-changed/);
  // 注釈を隠しているときは note の印も出さない
  assert.doesNotMatch(renderSvg(parsed, { interactive: false, showAnnotations: false, marks: { items: ['memo'], conns: [] } }, L, measure), /data-changed/);
});

// 接続ラベルの `\n` は block・note と同じく改行: 1 行ずつ <text>、白地は行の分の高さ(BLK-porter-20260930-0109)
test('接続ラベルの \\n は改行して描き、「\\n」の文字を描かない(block 同士の線と注釈線)', () => {
  const p = parseDSL([
    '@canvas width=400 height=200 grid=20',
    'block a "A" at 1,1 size 5x3',
    'block b "B" at 12,1 size 5x3',
    'note n "N" at 1,6 size 5x2',
    'a -> b "call\\nasync"',
    'n -> b "要求\\n(非同期)"',
  ].join('\n'));
  const svg = exportSvg(p, L, measure);
  assert.doesNotMatch(svg, /\\n/);
  for (const t of ['>call<', '>async<', '>要求<', '>(非同期)<']) assert.ok(svg.includes(t), t);
  const g = svg.match(/<g class="conn-label"[^>]*>(.*?)<\/g>/)[1];
  const ys = [...g.matchAll(/<text x="[^"]+" y="([^"]+)"/g)].map(m => +m[1]);
  assert.equal(ys.length, 2);
  assert.equal(ys[1] - ys[0], 12);
  assert.equal(+g.match(/<rect [^>]*height="([^"]+)"/)[1], 26);
  // 1 行のラベルは 1 つの <text> のまま
  assert.equal((exportSvg(parsed, L, measure).match(/<g class="conn-label"[^>]*>.*?<\/g>/)[0].match(/<text /g) || []).length, 1);
});

// group の名前の `\n` も block・note・接続と同じく改行(Shift+Enter で打った 2 行が画面・SVG で 2 行。Excel・Mermaid と同じ行割り)(BLK-owner-20260930-0208-2)
test('group の名前の \\n は改行して描き、「\\n」の文字を描かない', () => {
  const p = parseDSL(['@canvas width=400 height=200 grid=20', 'group g "Can\\nStack" at 1,1 size 10x6'].join('\n'));
  const svg = exportSvg(p, L, measure);
  assert.doesNotMatch(svg, /\\n/);
  const g = svg.match(/<g data-type="group"[^>]*>(.*?)<\/g>/)[1];
  const ys = [...g.matchAll(/<text x="[^"]+" y="([^"]+)"[^>]*>([^<]*)</g)].map(m => [+m[1], m[2]]);
  assert.deepEqual(ys.map(x => x[1]), ['Can', 'Stack']);
  assert.equal(ys[1][0] - ys[0][0], 13);
  assert.equal((exportSvg(parsed, L, measure).match(/<g data-type="group"[^>]*>.*?<\/g>/)[0].match(/<text /g) || []).length, 1);   // 1 行は 1 つのまま
});
