import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GIT_LOG_ARGS, parseGitLog, versionLabel, lineDiff, changedMarks, diffModel, diffLinesHtml } from '../diff-core.mjs';
import { buildDiffCoreBrowser } from '../../excel/build-browser.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// git log の出力(GIT_LOG_ARGS の形): 新しい順。改名をたどると古い版はその時の名前
const LOG = '\x1e5d3348e\x1f5d3348eaaaa\x1f2026-09-26 16:40\x1f手順1: @include化\n\nprimary/spi_swc.sb\n'
  + '\x1e81b4a61\x1f81b4a61bbbb\x1f2026-09-26 14:05\x1f手順2: SpiDrv を Spi_Driver に改名\n\nprimary/spi_swc.sb\n'
  + '\x1ed971021\x1fd971021cccc\x1f2026-09-26 12:00\x1fbaseline\n\nprimary/old_spi.sb\n';

test('parseGitLog: 版ごとに短い hash・日時・件名・その版でのパス(新しい順)', () => {
  assert.ok(GIT_LOG_ARGS.includes('--follow') && GIT_LOG_ARGS.includes('--name-only'));
  const v = parseGitLog(LOG);
  assert.equal(v.length, 3);
  assert.deepEqual(v[0], { hash: '5d3348e', full: '5d3348eaaaa', date: '2026-09-26 16:40', subject: '手順1: @include化', path: 'primary/spi_swc.sb' });
  assert.equal(v[2].path, 'primary/old_spi.sb');
  assert.equal(versionLabel(v[1]), '81b4a61 2026-09-26 14:05 手順2: SpiDrv を Spi_Driver に改名');
  assert.deepEqual(parseGitLog(''), []);
  assert.equal(parseGitLog(LOG.replace(/\n/g, '\r\n'))[0].path, 'primary/spi_swc.sb');   // Windows の git の改行
});

test('lineDiff: 行の差分をそのまま出す(座標の行も除かない)。改行コードの違いは差分にしない', () => {
  const a = '@canvas width=400\nblock a "A" at 1,1 size 4x2\nblock b "B" at 8,1 size 4x2\na -> b\n';
  const b = '@canvas width=400\r\nblock a "A" at 1,1 size 4x2\r\nblock b "B" at 10,1 size 4x2\r\na -> b\r\nb -> a\r\n';
  const ops = lineDiff(a, b);
  assert.deepEqual(ops.filter(o => o.op !== ' ').map(o => o.op + o.text), [
    '-block b "B" at 8,1 size 4x2', '+block b "B" at 10,1 size 4x2', '+b -> a',
  ]);
  assert.deepEqual(ops.find(o => o.op === '-'), { op: '-', text: 'block b "B" at 8,1 size 4x2', a: 3, b: 0 });
  assert.deepEqual(ops.find(o => o.op === '+'), { op: '+', text: 'block b "B" at 10,1 size 4x2', a: 0, b: 3 });
  assert.ok(lineDiff(a, a).every(o => o.op === ' '));
});

test('changedMarks: 変わった行が定義する要素・接続に印(左は消えた・変わった側、右は足した・変わった側)', () => {
  const ops = lineDiff('block a "A" at 1,1 size 4x2\ngroup g "G" at 0,0 size 9x9\nblock x "X" at 5,5 size 2x2\na -> x\n',
    'block a "A" at 1,1 size 4x2\ngroup g "G" at 0,0 size 12x9\nblock y "Y" at 5,5 size 2x2\na -> y "uses"\n# memo\n');
  const m = changedMarks(ops);
  assert.deepEqual(m.old, { items: ['g', 'x'], conns: ['a->x'] });
  assert.deepEqual(m.new, { items: ['g', 'y'], conns: ['a->y'] });
});

test('diffModel: 選んだ版の見出しが左に出て、左の本文はその版', () => {
  const v = parseGitLog(LOG)[1];
  const md = diffModel('block a "A" at 1,1 size 4x2\n', 'block a "A" at 2,1 size 4x2\n', v);
  assert.equal(md.title, '81b4a61 2026-09-26 14:05 手順2: SpiDrv を Spi_Driver に改名 (left) vs Current (right)');
  assert.equal(md.left, '81b4a61 2026-09-26 14:05 手順2: SpiDrv を Spi_Driver に改名');
  assert.equal(md.oldText, 'block a "A" at 1,1 size 4x2\n');
  assert.equal(md.added, 1); assert.equal(md.removed, 1);
  assert.deepEqual(md.marks.new.items, ['a']);
});

// 拡張の差分画面(getDiffContent)が選んだ版の本文で左の SVG を描き、見出しに版を出す。絵と行差分は HTML 版の「今の図と比べる」と
// 同じ core/render renderSvg(marks)・core/diff diffLinesHtml を拡張ホストで呼んだもの(diffParts)。webview に独自の parse / 描画を持たない
test('VSCode拡張: Visual Diff は選んだ版の本文を左に渡し、見出しに版を出す(描画は core/render、行差分は core/diff)', async () => {
  const Module = createRequire(import.meta.url)('module');
  const f = join(REPO, 'vscode-stableblock', 'src', 'extension.js');
  const orig = Module._load;
  Module._load = function (req, ...rest) {
    if (req === 'vscode') return new Proxy({}, { get: () => new Proxy(function () {}, { get: () => () => {} }) });
    return orig.call(this, req, ...rest);
  };
  try {
    const m = new Module(f); m.filename = f; m.paths = Module._nodeModulePaths(dirname(f));
    m._compile(readFileSync(f, 'utf8') + '\nmodule.exports.__diff = getDiffContent; module.exports.__parts = diffParts;', f);
    const v = parseGitLog(LOG)[2];
    const model = diffModel('block old "Old</script>" at 1,1 size 4x2\nblock keep "K" at 8,1 size 4x2\nold -> keep\n',
      'block cur "Cur" at 1,1 size 4x2\nblock keep "K" at 8,1 size 4x2\ncur -> keep\n', v);
    const html = m.exports.__diff(model, await m.exports.__parts(model));
    assert.match(html, /d971021 2026-09-26 12:00 baseline \(left\) vs Current \(right\)/);
    assert.doesNotMatch(html, /HEAD \(left\)/);
    const left = html.slice(html.indexOf('id="old-svg"'), html.indexOf('id="new-svg"'));
    const right = html.slice(html.indexOf('id="new-svg"'), html.indexOf('id="diff-lines"'));
    assert.match(left, /<g data-type="block" data-id="old"/);                  // 左は選んだ版の本文
    assert.match(left, /Old&lt;\/script&gt;/);                                 // </script> で途切れない
    assert.match(left, /data-changed="old"/); assert.match(left, /data-changed-conn="old-&gt;keep"/);
    assert.match(right, /data-changed="cur"/); assert.doesNotMatch(right, /data-changed="keep"/);
    assert.match(html, /<div class="l del"><span class="n">1<\/span><span class="n"><\/span>- block old/);
    assert.doesNotMatch(html, /<script/);                                        // webview に独自の parse / 描画を持たない
  } finally { Module._load = orig; }
  const src = readFileSync(join(REPO, 'vscode-stableblock', 'scripts', 'prepackage-core.js'), 'utf8');
  assert.match(src, /"diff", "diff-core\.mjs"/);
  assert.match(src, /"dsl", "dsl-core\.mjs"/);                                  // 拡張ホストが parse に使う
});

test('diffModel: HTML 版の「今の図と比べる」は見出しに 2 つの図名、差分が無ければ「変更なし」', () => {
  const md = diffModel('block a "A" at 1,1 size 4x2', 'block a "A" at 2,1 size 4x2', null, {}, { left: 'past/adc_swc.sb', right: 'now/adc_swc.sb' });
  assert.equal(md.title, 'past/adc_swc.sb(左) と now/adc_swc.sb(右・今の図)を比べている');
  assert.equal(md.left, 'past/adc_swc.sb'); assert.equal(md.right, 'now/adc_swc.sb'); assert.equal(md.same, false);
  const same = diffModel('block a "A" at 1,1 size 4x2\n', 'block a "A" at 1,1 size 4x2\r\n', null, {}, { left: 'x.sb', right: 'y.sb' });
  assert.equal(same.same, true);
  assert.equal(same.title, 'x.sb(左) と y.sb(右・今の図)を比べている — 変更なし');
  assert.match(diffModel('a', 'a', parseGitLog(LOG)[0]).title, / \(left\) vs Current \(right\) — 変更なし$/);
});

test('diffLinesHtml: 変わった行と前後 2 行を出し、離れた同じ行は「…」に畳む。本文は HTML に逃がす。差分なしは 1 行', () => {
  const a = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'block x "<b>" at 1,1 size 2x2'].join('\n');
  const b = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'block x "<b>" at 3,1 size 2x2'].join('\n');
  const h = diffLinesHtml(lineDiff(a, b));
  assert.match(h, /^<div class="l none">…<\/div><div class="l"><span class="n">6<\/span><span class="n">6<\/span>  l6<\/div>/);
  assert.match(h, /<div class="l del"><span class="n">8<\/span><span class="n"><\/span>- block x "&lt;b&gt;" at 1,1 size 2x2<\/div>/);
  assert.match(h, /<div class="l add"><span class="n"><\/span><span class="n">8<\/span>\+ block x "&lt;b&gt;" at 3,1 size 2x2<\/div>$/);
  assert.equal(diffLinesHtml(lineDiff('a', 'a')), '<div class="l none">差分なし(2 つの本文は同じ)</div>');
});

test('diff-core.browser.js is up to date (drift detection)。HTML 版は window.StableBlockDiff で同じ関数を使う', () => {
  const norm = t => t.replace(/\r\n/g, '\n');
  assert.equal(norm(readFileSync(join(REPO, 'core/diff/diff-core.browser.js'), 'utf8')), norm(buildDiffCoreBrowser(norm(readFileSync(join(REPO, 'core/diff/diff-core.mjs'), 'utf8')))),
    'Run `npm run build:browser` to regenerate diff-core.browser.js');
});
