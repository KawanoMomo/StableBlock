// core/check/check-cli: `npm run check` の出力。接続が 1 本も無い block を info で出す(画面の「◎ 未接続」と同じ判定)。
// info は error / warn の数にも終了コードにも数えない。テストの図は test-results/ 配下に作る
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIR = join(ROOT, 'test-results', 'check-cli-unlinked');
const CLI = join(ROOT, 'core', 'check', 'check-cli.mjs');

const COMMON = ['block rte "RTE" at 1,1 size 6x2', 'block os "OS" at 10,1 size 6x2'].join('\n');
function setup(mainLines) {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(join(DIR, 'shared'), { recursive: true });
  writeFileSync(join(DIR, 'shared', 'common.sb'), COMMON);
  writeFileSync(join(DIR, 'spi_swc.sb'), ['@include "shared/common.sb"', ...mainLines].join('\n'));
}
const run = () => spawnSync(process.execPath, [CLI, '.'], { cwd: DIR, encoding: 'utf8' });

test('check: include 先の block が本体で 1 本も繋がっていなければ定義の図と行に info が出る(終了コードは 0 のまま)', () => {
  setup(['block app "App" at 1,6 size 6x2', 'app -> os']);
  const r = run();
  const out = r.stdout.replace(/\\/g, '/');
  assert.match(out, /^shared\/common\.sb:1: info: block「rte」への接続が無い\(spi_swc\.sb から include\)$/m);
  assert.doesNotMatch(out, /「os」への接続が無い|「app」への接続が無い/);
  assert.match(out, /^error 0 \/ warn 0 \/ info 1$/m);
  assert.equal(r.status, 0);
});

test('check: 繋がれば info は消え、共通部そのもの(他の図に include される図)には出さない', () => {
  setup(['block app "App" at 1,6 size 6x2', 'app -> os', 'app -> rte']);
  const r = run();
  assert.doesNotMatch(r.stdout, /info/);
  assert.match(r.stdout, /^error 0 \/ warn 0$/m);
  assert.equal(r.status, 0);
});

test('check: 本文の未接続 block は本文の行に出て、error があるときの終了コードは info の有無で変わらない', () => {
  setup(['block app "App" at 1,6 size 6x2', 'block lone "Lone" at 10,6 size 6x2', 'app -> os', 'app -> rte', 'app -> nothing']);
  const r = run();
  assert.match(r.stdout.replace(/\\/g, '/'), /^spi_swc\.sb:3: info: block「lone」への接続が無い$/m);
  assert.match(r.stdout, /^error 1 \/ warn 0 \/ info 1$/m);
  assert.equal(r.status, 1);
});
