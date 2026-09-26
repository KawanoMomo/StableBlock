#!/usr/bin/env node
// bump-version.mjs — VERSION を唯一の正本として、版番号を持つ全ファイルを揃える(bump-version.sh の本体)。
//   node scripts/bump-version.mjs [version]   version を省くと VERSION の値で揃え直す
// 各ファイルは該当箇所だけを置き換え、改行コード(CRLF / LF)とほかの行はそのまま残す。
// 置き換える箇所が見つからないファイルがあれば何も書かずに失敗する(黙って取り残さない)。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// [ファイル, [{ name, re, to(ver, mm) }]]。re は置換対象に 1 回以上当たらなければならない
export const TARGETS = [
  ['VERSION', [
    { name: 'VERSION', re: /^[^\r\n]*/, to: v => v },
  ]],
  ['package.json', [
    { name: 'version', re: /("version":\s*")[^"]*(")/, to: v => `$1${v}$2` },
  ]],
  ['package-lock.json', [
    { name: 'version', re: /("version":\s*")[^"]*(")/, to: v => `$1${v}$2` },
    { name: 'packages[""].version', re: /("packages":\s*\{\s*"":\s*\{[^{}]*?"version":\s*")[^"]*(")/, to: v => `$1${v}$2` },
  ]],
  ['vscode-stableblock/package.json', [
    { name: 'version', re: /("version":\s*")[^"]*(")/, to: v => `$1${v}$2` },
  ]],
  ['stableblock.html', [
    { name: '既定の図の見出し', re: /# StableBlock v[0-9.]+/g, to: (v, mm) => `# StableBlock v${mm}` },
    { name: 'バッジ', re: /v[0-9.]+<\/span>/g, to: (v, mm) => `v${mm}</span>` },
  ]],
  ['README.md', [
    { name: 'vsix', re: /stableblock-[0-9.]+\.vsix/g, to: v => `stableblock-${v}.vsix` },
  ]],
  ['vscode-stableblock/README.md', [
    { name: 'vsix', re: /stableblock-[0-9.]+\.vsix/g, to: v => `stableblock-${v}.vsix` },
  ]],
];

export function majorMinor(ver) {
  const m = /^(\d+)\.(\d+)/.exec(ver);
  if (!m) throw new Error(`版番号の形が違う: ${ver}`);
  return `${m[1]}.${m[2]}`;
}

// texts: { path: 本文 }。返り値: { out: { path: 新しい本文 }, missing: ['path: name', ...] }
export function bumpTexts(texts, ver) {
  const mm = majorMinor(ver);
  const out = {}, missing = [];
  for (const [file, rules] of TARGETS) {
    let s = texts[file];
    if (s == null) { missing.push(`${file}: ファイルが無い`); continue; }
    for (const r of rules) {
      const re = new RegExp(r.re.source, r.re.flags.replace('g', ''));
      if (!re.test(s)) { missing.push(`${file}: ${r.name}`); continue; }
      s = s.replace(r.re, r.to(ver, mm));
    }
    out[file] = s;
  }
  return { out, missing };
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const texts = {};
  for (const [file] of TARGETS) {
    try { texts[file] = readFileSync(join(root, file), 'utf8'); } catch { /* missing で報告 */ }
  }
  const ver = (process.argv[2] || texts.VERSION || '').trim();
  const { out, missing } = bumpTexts(texts, ver);
  if (missing.length) {
    console.error(`版番号を置き換える箇所が見つからない(何も書いていない):\n  ${missing.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`Bumping to v${ver} (v${majorMinor(ver)})`);
  for (const [file, s] of Object.entries(out)) {
    if (s !== texts[file]) { writeFileSync(join(root, file), s); console.log(`  updated ${file}`); }
    else console.log(`  unchanged ${file}`);
  }
}

const self = p => resolve(p).toLowerCase();
if (process.argv[1] && self(fileURLToPath(import.meta.url)) === self(process.argv[1])) main();
