#!/usr/bin/env node
// 複数の .sb を開かずに検査する: `npm run check -- <file.sb|dir> ...`(dir はその下の .sb を全部)
// 画面のエラー表示と同じ診断(読めない行の理由・存在しない ID への接続・block の重なり・線の横切り)を
// `ファイル:行: error|warn: 内容` で出す。@include は読み込んだ先のファイルと行で示す。error があれば終了コード 1。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDSL } from '../dsl/dsl-core.mjs';
import { connectionPaths } from '../label/label-core.mjs';
import { checkDiagram } from './check-core.mjs';

// @include を展開し、展開後の各行がどのファイルの何行目かを返す
export function expandIncludes(file, seen = new Set()) {
  const abs = resolve(file);
  const text = readFileSync(abs, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = [], origin = [];
  text.split('\n').forEach((line, i) => {
    const m = line.trim().match(/^@include\s+"([^"]+)"/);
    if (m && !seen.has(abs)) {
      const inc = resolve(dirname(abs), m[1]);
      try {
        const sub = expandIncludes(inc, new Set([...seen, abs]));
        lines.push(...sub.lines); origin.push(...sub.origin);
        return;
      } catch { /* 読めない include は行のまま残し、parser のエラーにする */ }
    }
    lines.push(line); origin.push({ file: abs, line: i + 1 });
  });
  return { lines, origin };
}

export function checkFile(file, mode = 'curved') {
  const { lines, origin } = expandIncludes(file);
  const parsed = parseDSL(lines.join('\n'));
  return checkDiagram(parsed, lines, connectionPaths(parsed, mode)).map(d => ({ ...d, ...(origin[d.line - 1] || { file: resolve(file), line: d.line }) }));
}

function collect(p) {
  const st = statSync(p);
  if (!st.isDirectory()) return [p];
  return readdirSync(p).flatMap(n => collect(join(p, n))).filter(f => f.endsWith('.sb'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (!args.length) { console.error('usage: npm run check -- <file.sb|dir> ...'); process.exit(2); }
  let errors = 0, warns = 0;
  for (const f of args.flatMap(collect)) {
    for (const d of checkFile(f)) {
      console.log(`${relative(process.cwd(), d.file) || d.file}:${d.line}: ${d.level}: ${d.msg}${resolve(d.file) !== resolve(f) ? `(${relative(process.cwd(), f)} から include)` : ''}`);
      if (d.level === 'error') errors++; else warns++;
    }
  }
  console.log(`error ${errors} / warn ${warns}`);
  process.exit(errors ? 1 : 0);
}
