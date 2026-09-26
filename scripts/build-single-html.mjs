#!/usr/bin/env node
// build-single-html.mjs — stableblock.html が <script src="core/..."> で読む共通コアを本文に埋め込み、
// その 1 ファイルだけで file:// で動く stableblock.html を書き出す(Release に添付する単体の HTML と、Windows アプリ版が表示する画面)。
//   node scripts/build-single-html.mjs [出力先]   出力先を省くと dist/stableblock.html
// リポジトリの stableblock.html は変えない(開発中は今どおり core/ を読む)。埋め込む元が見つからなければ何も書かずに失敗する。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_RE = /<script src="([^"]+)"><\/script>/g;

// html の <script src="相対パス"></script> を、read(相対パス) の中身を持つ <script> に置き換える。
// 中身の "</script" は HTML の読み取りで script が途中で閉じないよう "<\/script" に逃がす(JS としては同じ文字列)。
// 返り値: { html, inlined: [相対パス], missing: [相対パス] }。http(s) の src は触らない
export function inlineScripts(html, read) {
  const inlined = [], missing = [];
  const out = html.replace(SRC_RE, (all, src) => {
    if (/^[a-z]+:/i.test(src)) return all;
    const body = read(src);
    if (body == null) { missing.push(src); return all; }
    inlined.push(src);
    return `<script>/* ${src} */\n${body.replace(/<\/script/gi, '<\\/script')}\n</script>`;
  });
  return { html: out, inlined, missing };
}

export function buildSingleHtml(root = ROOT) {
  const html = readFileSync(join(root, 'stableblock.html'), 'utf8');
  return inlineScripts(html, rel => {
    const p = join(root, ...rel.split('/'));
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const dest = resolve(process.argv[2] || join(ROOT, 'dist', 'stableblock.html'));
  const r = buildSingleHtml();
  if (r.missing.length) {
    console.error('埋め込む元が見つからない: ' + r.missing.join(', '));
    process.exit(1);
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, r.html);
  console.log(`${dest}(${r.inlined.length} 本を埋め込み、${Buffer.byteLength(r.html)} バイト)`);
}
