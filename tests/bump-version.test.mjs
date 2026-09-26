// bump-version(scripts/bump-version.mjs): 版番号を持つ全ファイルを VERSION に揃える
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { TARGETS, bumpTexts } from '../scripts/bump-version.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readAll = dir => Object.fromEntries(TARGETS.map(([f]) => [f, readFileSync(join(dir, f), 'utf8')]));

test('bump-version: 今の版番号はどのファイルでも VERSION と揃っている(揃え直しても 1 バイトも変わらない)', () => {
  const texts = readAll(ROOT);
  const { out, missing } = bumpTexts(texts, texts.VERSION.trim());
  assert.deepEqual(missing, []);
  for (const [f] of TARGETS) assert.equal(out[f], texts[f], `${f} が VERSION(${texts.VERSION.trim()})と揃っていない`);
});

test('bump-version: ルートの package.json と package-lock.json も拡張の package.json と一緒に上がり、ほかの行と改行コードは動かない', () => {
  const texts = readAll(ROOT);
  const { out, missing } = bumpTexts(texts, '9.8.7');
  assert.deepEqual(missing, []);
  assert.equal(JSON.parse(out['package.json']).version, '9.8.7');
  assert.equal(JSON.parse(out['vscode-stableblock/package.json']).version, '9.8.7');
  const lock = JSON.parse(out['package-lock.json']);
  assert.equal(lock.version, '9.8.7');
  assert.equal(lock.packages[''].version, '9.8.7');
  const deps = Object.entries(lock.packages).filter(([k]) => k);
  const before = JSON.parse(texts['package-lock.json']).packages;
  for (const [k, v] of deps) assert.equal(v.version, before[k].version, `依存 ${k} の版は動かさない`);
  assert.equal(out.VERSION, '9.8.7\n');
  assert.match(out['stableblock.html'], /v9\.8<\/span>/);
  assert.match(out['stableblock.html'], /# StableBlock v9\.8\b/);
  assert.match(out['README.md'], /stableblock-9\.8\.7\.vsix/);
  assert.match(out['vscode-stableblock/README.md'], /stableblock-9\.8\.7\.vsix/);
  for (const [f] of TARGETS) {
    const a = texts[f].split('\n'), b = out[f].split('\n');
    assert.equal(b.length, a.length, `${f} の行数が変わった`);
    assert.equal(b.filter(l => l.endsWith('\r')).length, a.filter(l => l.endsWith('\r')).length, `${f} の改行コードが変わった`);
  }
});

test('bump-version: 置き換える箇所が見つからないファイルがあれば名前を挙げ、CLI は何も書かずに失敗する', () => {
  const texts = readAll(ROOT);
  const broken = { ...texts, 'package.json': texts['package.json'].replace('"version"', '"ver"') };
  assert.deepEqual(bumpTexts(broken, '9.8.7').missing, ['package.json: version']);

  const dir = join(ROOT, 'test-results', 'bump-version');
  rmSync(dir, { recursive: true, force: true });
  for (const f of ['scripts/bump-version.mjs', ...TARGETS.map(([f]) => f)]) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    copyFileSync(join(ROOT, f), join(dir, f));
  }
  const run = v => spawnSync(process.execPath, [join(dir, 'scripts', 'bump-version.mjs'), v], { encoding: 'utf8' });
  let r = run('9.8.7');
  assert.equal(r.status, 0, r.stderr);
  const after = readAll(dir);
  assert.equal(JSON.parse(after['package.json']).version, '9.8.7');
  assert.equal(after.VERSION, '9.8.7\n');

  writeFileSync(join(dir, 'README.md'), 'no vsix here\n');
  r = run('9.9.0');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /README\.md: vsix/);
  assert.equal(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version, '9.8.7');   // 何も書いていない
  rmSync(dir, { recursive: true, force: true });
});
