// 画面の語彙(terms-core.mjs)と、HTML版・VSCode拡張に静的に書いた入口の名前・ツールチップが一致することを守る。
// 入口の名前は「何をするか」で付ける(略語・絵文字だけ・現在の値だけにしない)。README は実在するものだけを案内する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { termText, termTitle, termKeys, styleName, lineShapeName, lineModeText, typeName } from '../terms-core.mjs';
import { buildTermsCoreBrowser } from '../../excel/build-browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const norm = (s) => s.replace(/\r\n/g, '\n');

// 入口のタグを拾う: <button ... data-term="k" ...>文字</button> / <input ... data-term="k" ...>
function entries(src) {
  const out = [];
  const re = /<(button|input)\b([^>]*?)\bdata-term="([^"]+)"([^>]*)>/g;
  let m;
  while ((m = re.exec(src))) {
    const attrs = m[2] + ' ' + m[4];
    const attr = (n) => { const a = new RegExp('\\b' + n + '="([^"]*)"').exec(attrs); return a ? a[1] : null; };
    let text = null;
    if (m[1] === 'button') text = src.slice(re.lastIndex, src.indexOf('</button>', re.lastIndex));
    else text = attr('placeholder');
    out.push({ key: m[3], text, title: attr('title') });
  }
  return out;
}
const decode = (s) => s == null ? s : s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&minus;/g, '−').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

test('terms-core.browser.js is up to date (drift detection)', () => {
  const src = read('core/terms/terms-core.mjs');
  const built = read('core/terms/terms-core.browser.js');
  assert.equal(norm(built), norm(buildTermsCoreBrowser(norm(src))),
    'Run `npm run build:browser` to regenerate terms-core.browser.js');
});

test('HTML版: data-term の入口の名前とツールチップが語彙(ja)と一致する', () => {
  const es = entries(read('stableblock.html'));
  assert.ok(es.length >= 18, 'data-term の入口が見つからない: ' + es.length);
  for (const e of es) {
    const want = e.key === 'line-mode' ? lineModeText('curved', 'ja') : termText(e.key, 'ja');
    assert.equal(e.text, want, e.key + ' の名前');
    assert.equal(e.title, termTitle(e.key, 'ja'), e.key + ' のツールチップ');
  }
  // 語彙の ja キーは全部 HTML 版のどこかで使われている(死んだ語を残さない)
  const used = new Set(es.map(e => e.key));
  for (const k of termKeys('ja')) assert.ok(used.has(k), 'HTML 版で使われていない語: ' + k);
});

test('VSCode拡張: data-term の入口の名前とツールチップが語彙(en)と一致する', () => {
  const es = entries(read('vscode-stableblock/src/extension.js'));
  assert.ok(es.length >= 15, 'data-term の入口が見つからない: ' + es.length);
  for (const e of es) {
    assert.equal(decode(e.text), termText(e.key, 'en'), e.key + ' の名前');
    assert.equal(decode(e.title), termTitle(e.key, 'en'), e.key + ' のツールチップ');
  }
});

test('ツールバーのボタンは全部 data-term と動詞のツールチップを持つ', () => {
  const html = read('stableblock.html');
  const bar = html.slice(html.indexOf('<div class="toolbar">'), html.indexOf('</div>\n</div>', html.indexOf('<div class="toolbar">')));
  const buttons = bar.match(/<button\b[^>]*>/g) || [];
  assert.ok(buttons.length >= 16);
  for (const b of buttons) {
    assert.match(b, /data-term="/, 'data-term が無い: ' + b);
    assert.match(b, /title="[^"]+"/, 'ツールチップが無い: ' + b);
  }
});

test('略語・絵文字だけ・全角記号の入口名を使わない', () => {
  const html = read('stableblock.html');
  const ext = read('vscode-stableblock/src/extension.js');
  for (const bad of ['>◎ HL<', '>📋<', '>PNG透過<', '＋ ブロック追加', '>⌇ 曲線<']) {
    assert.ok(!html.includes(bad), 'HTML版に古い名前が残っている: ' + bad);
  }
  for (const bad of ['&#x25CE; HL<', '&#x2398; Copy<', 'PNG&#x2205;<', '&#x25C7; Anno<']) {
    assert.ok(!ext.includes(bad), '拡張に古い名前が残っている: ' + bad);
  }
  for (const k of termKeys()) {
    for (const lang of ['ja', 'en']) {
      if (!termKeys(lang).includes(k)) continue;
      const t = termTitle(k, lang);
      assert.ok(t && t.length >= 4, k + '/' + lang + ' のツールチップが短すぎる');
      assert.ok(!/＋/.test(termText(k, lang)), k + ' に全角の＋');
    }
  }
});

test('スタイル・線の形・種類の表示名は日本語(ja)と英語(en)を持つ', () => {
  assert.equal(styleName('solid'), '実線');
  assert.equal(styleName('dashed'), '破線');
  assert.equal(styleName('bold'), '太線');
  assert.equal(styleName('dashed', 'en'), 'Dashed');
  assert.equal(styleName('dotted'), 'dotted');
  assert.equal(lineShapeName(''), '既定');
  assert.equal(lineShapeName(undefined), '既定');
  assert.equal(lineShapeName('ortho'), '直角');
  assert.equal(lineModeText('curved'), '⌇ 線の形: 曲線');
  assert.equal(lineModeText('straight'), '╱ 線の形: 直線');
  assert.equal(lineModeText('ortho', 'en'), '⊾ Line: Right-angle');
  assert.equal(typeName('block'), 'ブロック');
  assert.equal(typeName('note', 'en'), 'NOTE');
  assert.equal(termText('line-mode'), lineModeText('curved'));
  assert.throws(() => termText('nope'), /unknown key/);
});

test('README は実在するファイル・フォルダだけを案内する', () => {
  for (const p of ['README.md', 'vscode-stableblock/README.md']) {
    const md = read(p);
    assert.ok(!/mcp-server|MCPサーバー|\bexamples\//.test(md), p + ' が存在しないものを案内している');
  }
  // ファイル構成のツリーに書いた名前が実在する
  const md = read('README.md');
  const tree = md.slice(md.indexOf('## ファイル構成'));
  const block = tree.slice(tree.indexOf('```') + 3, tree.indexOf('```', tree.indexOf('```') + 3));
  const names = [...block.matchAll(/[├└]── ([^\s#]+)/g)].map(m => m[1].replace(/\/$/, ''));
  assert.ok(names.length >= 8);
  let parent = '';
  for (const line of block.split('\n')) {
    const m = /^(│   |    )?[├└]── ([^\s#]+)/.exec(line);
    if (!m) continue;
    const name = m[2].replace(/\/$/, '');
    const rel = m[1] ? join(parent, name) : name;
    if (!m[1] && m[2].endsWith('/')) parent = name;
    assert.ok(existsSync(join(ROOT, rel)), 'README のファイル構成に実在しないもの: ' + rel);
  }
});

// 書き出しの ▾ の選択肢は何枚を書き出すかを出す(BLK-primary-20260926-1205)
import { exportAllText } from '../terms-core.mjs';
test('exportAllText: 「読み込んだ全部の図(N 枚)」', () => {
  assert.equal(exportAllText(13), '読み込んだ全部の図(13 枚)');
  assert.equal(exportAllText(2, 'en'), 'All loaded diagrams (2)');
});
