#!/usr/bin/env node
// version-match.mjs — 作った配布物の版(setup.exe の ProductVersion など)がタグの版と一致するかを確かめる(CI の windows-app.yml が使う)。
//   node scripts/version-match.mjs <読み取った版> <タグの版>   一致すれば exit 0、食い違えば理由を出して exit 1
// 読み取った版は前後の空白・固定幅の埋め(NUL など)を含みうるので、数字と . の並びだけを取り出す。
// タグは v{major}.{minor}(2.0)、Windows の版情報は 4 要素に埋められる(2.0.0.0)ので、先頭 2 要素(major.minor)で比べる。
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// 版の文字列から数字の並び [major, minor, ...] を取り出す(前後の空白・埋め・先頭の v は無視)。数字が無ければ null
export function versionParts(s) {
  const m = String(s ?? '').match(/\d+(?:\.\d+)*/);
  return m ? m[0].split('.').map(Number) : null;
}

// 2 つの版が同じか: 先頭 2 要素(足りなければ 0)が等しい。どちらかに数字が無ければ false
export function sameVersion(a, b) {
  const x = versionParts(a), y = versionParts(b);
  if (!x || !y) return false;
  return [0, 1].every(i => (x[i] || 0) === (y[i] || 0));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [got, want] = process.argv.slice(2);
  if (got === undefined || want === undefined) {
    console.error('使い方: node scripts/version-match.mjs <読み取った版> <タグの版>');
    process.exit(2);
  }
  const shown = s => JSON.stringify(String(s));   // 空白・埋めが見えるように引用符付きで出す
  if (!sameVersion(got, want)) {
    console.error(`版 ${shown(got)} がタグ ${shown(want)} と食い違う(先頭 2 要素で比べた)`);
    process.exit(1);
  }
  console.log(`版の一致: ${shown(got)} = タグ ${shown(want)}`);
}
