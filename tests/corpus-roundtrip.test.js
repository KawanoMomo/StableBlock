// コーパス往復テスト: porter の実物(inbox)と見本(corpus)の全 .sb を parseDSL → serializeDSL で往復し、バイト一致を確かめる。
// 結果は test-results/corpus-roundtrip.json に {total, passed, failed[]} で書く(releaser の品質条件が読む)。
// 置き場は SB_CORPUS_ROOT(既定 E:\03_Loop\persona-data\porter)。フォルダが無ければ 0 件で skip。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const CORPUS_ROOT = process.env.SB_CORPUS_ROOT || 'E:\\03_Loop\\persona-data\\porter';
const DIRS = ['inbox', 'corpus'].map(d => path.join(CORPUS_ROOT, d));
const OUT = path.join(ROOT, 'test-results', 'corpus-roundtrip.json');

function listSb(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listSb(full));
    else if (e.name.toLowerCase().endsWith('.sb')) out.push(full);
  }
  return out.sort();
}

function firstDiff(a, b) {
  const al = a.split('\n'), bl = b.split('\n');
  for (let i = 0; i < Math.max(al.length, bl.length); i++) {
    if (al[i] !== bl[i]) return { line: i + 1, expected: al[i] ?? null, actual: bl[i] ?? null };
  }
  return { line: null, expected: null, actual: null };
}

test('corpus: 全 .sb が parseDSL → 直列化でバイト一致する', async (t) => {
  const files = DIRS.flatMap(listSb);
  const result = { total: files.length, passed: 0, failed: [] };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  if (!files.length) {
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
    t.skip(`コーパスが無い: ${DIRS.join(', ')}`);
    return;
  }
  const { parseDSL, serializeDSL } = await import(pathToFileURL(path.join(ROOT, 'core', 'dsl', 'dsl-core.mjs')).href);
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
  for (const file of files) {
    const rel = path.relative(CORPUS_ROOT, file).split(path.sep).join('/');
    const bytes = fs.readFileSync(file);
    const text = decoder.decode(bytes);
    let parsed, back;
    try { parsed = parseDSL(text); back = Buffer.from(serializeDSL(parsed), 'utf8'); }
    catch (e) { result.failed.push({ file: rel, reason: `例外: ${e.message}` }); continue; }
    // @include は GUI が先に展開するので、未展開の警告は往復の失敗に数えない
    const errors = parsed.errors.filter(e => !e.msg.startsWith('@include'));
    if (!back.equals(bytes)) {
      result.failed.push({ file: rel, reason: 'バイト不一致', ...firstDiff(bytes.toString('utf8'), back.toString('utf8')) });
    } else if (errors.length) {
      result.failed.push({ file: rel, reason: '解釈できない行', errors: errors.map(e => `L${e.line}: ${e.msg}`) });
    } else {
      result.passed++;
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
  assert.deepEqual(result.failed, [], `往復で壊れた .sb が ${result.failed.length}/${result.total} 件(${path.relative(ROOT, OUT)})`);
});
