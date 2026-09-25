#!/usr/bin/env node
// 複数の .sb を開かずに検査する: `npm run check -- <file.sb|dir> ...`(dir はその下の .sb を全部)
// 画面のエラー表示と同じ診断(読めない行の理由・存在しない ID への接続・block の重なり・線の横切り・ラベルの重なり)を
// `ファイル:行: error|warn: 内容` で出す。@include は読み込んだ先のファイルと行で示す。error があれば終了コード 1。
// --refs <ID>: ID を定義・参照している図と行を一覧する。--rename <旧> <新>: 全図で ID を改名する(core/label の planRename)。
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDSL } from '../dsl/dsl-core.mjs';
import { connectionPaths, placeLabels, labelIssues, findIdInDsl, planRename } from '../label/label-core.mjs';
import { expandIncludes, checkIncluded } from './check-core.mjs';

// @include を展開する(core の expandIncludes に fs の読み込みを渡す)。include 先は include 元のファイルからの相対パス
export function expandFile(file) {
  const read = p => { try { return readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); } catch { return null; } };
  const abs = resolve(file).split(sep).join('/');
  return expandIncludes(read(abs) ?? '', read, abs);
}

export function checkFile(file, mode = 'curved') {
  const exp = expandFile(file);
  const parsed = parseDSL(exp.text);
  const paths = connectionPaths(parsed, mode);
  const name = p => relative(process.cwd(), p) || p;
  return checkIncluded(parsed, exp, paths, { name, inline: false, hint: '(ファイルが無い)', labelIssues: labelIssues(placeLabels(paths, parsed), parsed) })
    .map(d => ({ ...d, file: resolve(d.file), line: d.fileLine }));
}

function collect(p) {
  const st = statSync(p);
  if (!st.isDirectory()) return [p];
  return readdirSync(p).filter(n => !n.startsWith('.') && n !== 'node_modules')
    .flatMap(n => collect(join(p, n))).filter(f => f.endsWith('.sb'));
}

// 指定したファイル・フォルダの .sb と、それらが @include している先(フォルダの外も)。重複なし、絶対パス
export function collectWithIncludes(paths) {
  const out = [], seen = new Set();
  const visit = f => {
    const abs = resolve(f);
    if (seen.has(abs)) return;
    seen.add(abs);
    let text;
    try { text = readFileSync(abs, 'utf8'); } catch { return; }
    out.push(abs);
    for (const line of text.split('\n')) {
      const m = line.trim().match(/^@include\s+"([^"]+)"/);
      if (m) visit(resolve(dirname(abs), m[1]));
    }
  };
  paths.flatMap(collect).forEach(visit);
  return out;
}

// ID を定義・参照している図と行(図を開かずに探す)。[{ file, line, kind: 'def' | 'ref', text }]
export function findRefs(paths, id) {
  return collectWithIncludes(paths).flatMap(file => findIdInDsl(readFileSync(file, 'utf8'), id).map(r => ({ file, ...r })));
}

// 図をまたいで改名する(定義行と接続の from / to だけ。改行・BOM・他の行はそのまま)。dryRun なら書き込まない
// 戻り値は planRename と同じ({ error } か { changes, defs })。path は作業フォルダからの相対パス
export function renameAcross(paths, oldId, newId, dryRun = false) {
  const files = collectWithIncludes(paths).map(abs => ({ path: relative(process.cwd(), abs) || abs, text: readFileSync(abs, 'utf8') }));
  const plan = planRename(files, oldId, newId);
  if (!plan.error && !dryRun) for (const c of plan.changes) writeFileSync(resolve(c.path), c.text, 'utf8');
  return plan;
}

const USAGE = `usage:
  npm run check -- <file.sb|dir> ...                     図を開かずに検査する
  npm run check -- --refs <ID> <file.sb|dir> ...         ID を定義・参照している図と行を一覧する(@include 先を含む)
  npm run check -- --rename <旧ID> <新ID> <file.sb|dir> ... [--dry-run]
                                                         全図で ID を改名する(定義行と接続の from / to だけを書き換える)`;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const rel = f => relative(process.cwd(), f) || f;
  if (args[0] === '--refs') {
    const [, id, ...paths] = args;
    if (!id || !paths.length) { console.error(USAGE); process.exit(2); }
    const refs = findRefs(paths, id);
    for (const r of refs) console.log(`${rel(r.file)}:${r.line}: ${r.kind === 'def' ? '定義' : '参照'}: ${r.text.trim()}`);
    const files = new Set(refs.map(r => r.file)).size;
    console.log(refs.length ? `「${id}」: ${files} 枚 ${refs.length} 行(定義 ${refs.filter(r => r.kind === 'def').length} 行)` : `「${id}」を定義・参照している図は無い`);
    process.exit(refs.length ? 0 : 1);
  }
  if (args[0] === '--rename') {
    const dryRun = args.includes('--dry-run');
    const [, oldId, newId, ...paths] = args.filter(a => a !== '--dry-run');
    if (!oldId || !newId || !paths.length) { console.error(USAGE); process.exit(2); }
    const plan = renameAcross(paths, oldId, newId, dryRun);
    if (plan.error) { console.error(`改名しなかった: ${plan.error}`); process.exit(1); }
    for (const c of plan.changes) for (const l of c.lines) console.log(`${rel(c.path)}:${l.line}: ${l.after.trim()}`);
    const n = plan.changes.reduce((s, c) => s + c.lines.length, 0);
    console.log(`${dryRun ? '(--dry-run のため書き込んでいない) ' : ''}「${oldId}」→「${newId}」: ${plan.changes.length} 枚 ${n} 行`);
    process.exit(0);
  }
  if (!args.length) { console.error(USAGE); process.exit(2); }
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
