// 単体の stableblock.html(scripts/build-single-html.mjs): Release に添付する HTML と Windows アプリ版の画面は、
// core/*.js を埋め込んだ 1 ファイルだけで file:// で動く(BLK-human-20260926-2100)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inlineScripts, buildSingleHtml } from '../scripts/build-single-html.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ツール欄の「操作とキー」に、ラベルの改行キー(Shift+Enter)が、その場編集の行の近くにほかのキーと同じ書式で載る(BLK-owner-20260930-0608-2)
test('操作とキー: その場編集の行の近くに Shift+Enter でラベルを改行する行がある', () => {
  const src = readFileSync(join(ROOT, 'stableblock.html'), 'utf8');
  const help = src.slice(src.indexOf('id="help-keys"'), src.indexOf('</details>', src.indexOf('id="help-keys"')));
  assert.match(help, /ラベルをその場で編集[^<]*<br><span style="color:var\(--muted\)">Shift\+Enter<\/span> ラベルを改行\(block・group・note・接続\)/);
});

test('build-single-html: stableblock.html が読む core/ の script は全部埋め込まれ、外のファイルを読む <script src> が残らない', () => {
  const src = readFileSync(join(ROOT, 'stableblock.html'), 'utf8');
  const wanted = [...src.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  assert.ok(wanted.length >= 10, 'script src が見つからない: ' + wanted.length);
  const r = buildSingleHtml(ROOT);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.inlined, wanted);
  assert.doesNotMatch(r.html, /<script src="core\//);
  for (const rel of wanted) assert.ok(r.html.includes(`/* ${rel} */`), rel + ' が埋め込まれていない');
  // 埋め込み以外の本文(画面・スタイル・本体のスクリプト)は元のまま
  assert.equal(r.html.replace(/<script>\/\* core\/[^*]+ \*\/\n[\s\S]*?\n<\/script>/g, ''), src.replace(/<script src="core\/[^"]+"><\/script>/g, ''));
});

test('inlineScripts: 中身の "</script" は閉じタグにならないよう逃がし、見つからない src は missing に返して残す。http(s) は触らない', () => {
  const html = '<script src="a.js"></script><script src="https://x/y.js"></script><script src="none.js"></script>';
  const r = inlineScripts(html, p => (p === 'a.js' ? 'var s = "</script>";' : null));
  assert.deepEqual(r.inlined, ['a.js']);
  assert.deepEqual(r.missing, ['none.js']);
  assert.ok(r.html.includes(String.raw`var s = "<\/script>";`));
  assert.ok(r.html.includes('<script src="https://x/y.js"></script>'));
  assert.ok(r.html.includes('<script src="none.js"></script>'));
  assert.equal((r.html.match(/<\/script>/g) || []).length, 3);
});
