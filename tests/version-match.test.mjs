// version-match(scripts/version-match.mjs): CI で setup.exe の版とタグの版を突き合わせる比較(BLK-human-20260928-2310)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { versionParts, sameVersion } from '../scripts/version-match.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'version-match.mjs');

test('versionParts: 前後の空白・固定幅の埋め・先頭の v を除いて数字の並びを取る', () => {
  assert.deepEqual(versionParts('2.0'), [2, 0]);
  assert.deepEqual(versionParts('2.0                                                '), [2, 0]);
  assert.deepEqual(versionParts('  2.1.0.0\0\0'), [2, 1, 0, 0]);
  assert.deepEqual(versionParts('v2.1'), [2, 1]);
  assert.equal(versionParts(''), null);
  assert.equal(versionParts(undefined), null);
});

test('sameVersion: 空白の埋めと 2.0 / 2.0.0 / 2.0.0.0 の違いを吸収し、先頭 2 要素で比べる', () => {
  assert.equal(sameVersion('2.0                                                ', '2.0'), true);   // CI で落ちた形
  assert.equal(sameVersion('2.0.0', '2.0'), true);
  assert.equal(sameVersion('2.0.0.0', '2.0'), true);
  assert.equal(sameVersion('2', '2.0'), true);
  assert.equal(sameVersion(' 2.1 ', '2.1'), true);
  assert.equal(sameVersion('2.1', '2.0'), false);
  assert.equal(sameVersion('3.0', '2.0'), false);
  assert.equal(sameVersion('', '2.0'), false);
  assert.equal(sameVersion('2.0', ''), false);
});

test('version-match CLI: 一致すれば exit 0、食い違えば理由を出して exit 1', () => {
  const run = (...a) => spawnSync(process.execPath, [SCRIPT, ...a], { encoding: 'utf8' });
  const ok = run('2.0                                                ', '2.0');
  assert.equal(ok.status, 0, ok.stderr);
  const ng = run('2.1.0.0', '2.0');
  assert.equal(ng.status, 1);
  assert.match(ng.stderr, /版 "2\.1\.0\.0" がタグ "2\.0" と食い違う/);
  assert.equal(run('2.0').status, 2);
});
