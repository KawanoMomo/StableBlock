// コーパス往復テスト: .sb を parseDSL → serializeDSL で往復し、バイト一致を確かめる。
// - 同梱(リポジトリ内の core/excel/fixtures と tests/e2e/fixtures の .sb): assert する。崩れたら製品の退行。
// - persona-data(porter の実物 inbox と見本 corpus): ループ外から来る入力なので fail させない。
//   結果を test-results/corpus-roundtrip.json に {total, passed, failed[]} で書き(releaser の品質条件が読む)、失敗は console に出す。
// 置き場は SB_CORPUS_ROOT(既定 E:\03_Loop\persona-data\porter)。フォルダが無ければ 0 件で skip。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const CORPUS_ROOT = process.env.SB_CORPUS_ROOT || 'E:\\03_Loop\\persona-data\\porter';
const DIRS = ['inbox', 'corpus'].map(d => path.join(CORPUS_ROOT, d));
const BUNDLED_DIRS = [path.join(ROOT, 'core', 'excel', 'fixtures'), path.join(ROOT, 'tests', 'e2e', 'fixtures')];
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

// files を往復し {total, passed, failed[]} を返す。failed の file は base からの相対パス
async function roundtrip(files, base) {
  const result = { total: files.length, passed: 0, failed: [] };
  if (!files.length) return result;
  const { parseDSL, serializeDSL } = await import(pathToFileURL(path.join(ROOT, 'core', 'dsl', 'dsl-core.mjs')).href);
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
  for (const file of files) {
    const rel = path.relative(base, file).split(path.sep).join('/');
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
  return result;
}

test('fixtures: 同梱の .sb が parseDSL → 直列化でバイト一致する', async () => {
  const files = BUNDLED_DIRS.flatMap(listSb);
  assert.ok(files.length > 0, `同梱の .sb が見つからない: ${BUNDLED_DIRS.join(', ')}`);
  const result = await roundtrip(files, ROOT);
  assert.deepEqual(result.failed, [], `同梱の .sb が往復で壊れた: ${result.failed.length}/${result.total} 件`);
});

test('corpus: persona-data の .sb を往復して結果を JSON に書く(fail させない)', async (t) => {
  const files = DIRS.flatMap(listSb);
  const result = await roundtrip(files, CORPUS_ROOT);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
  if (!files.length) { t.skip(`コーパスが無い: ${DIRS.join(', ')}`); return; }
  const summary = `corpus-roundtrip: ${result.passed}/${result.total} passed(${path.relative(ROOT, OUT)})`;
  if (result.failed.length) {
    console.log(`${summary}、往復で崩れた ${result.failed.length} 件:`);
    for (const f of result.failed) console.log(`  - ${f.file}: ${f.reason}${f.line ? ` L${f.line}` : ''}`);
  } else {
    console.log(summary);
  }
});
