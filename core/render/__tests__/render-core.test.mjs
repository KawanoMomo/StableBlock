// core/render: 画面と書き出し(SVG / PNG)の描画。書き出しは本文だけで決まり、画面の状態(選択・ハンドル・スナップガイド・
// グリッド・検索や「未接続を薄く」の薄め・注釈の表示切替・表示倍率)を持ち込まない。HTML 版と VSCode 拡張は同じ関数を使う。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as L from '../../label/label-core.mjs';
import { parseDSL } from '../../dsl/dsl-core.mjs';
import { renderSvg, exportSvg, exportPngSize, matchesSearchItem } from '../render-core.mjs';
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
