// ペルソナ台本の手順 = spec の共通部品。spec は `const { test, expect, ... } = require('./_scenario');` で使う。
// 操作は実マウス(locator.click / page.mouse)で行う。dispatchEvent は当たり判定を素通りするので使わない。
const base = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { acquireServer, REPO } = require('../servers');

const test = base.test.extend({
  // worker ごとに 1 つの静的サーバ(servers.js)
  sbServer: [async ({}, use, workerInfo) => {
    const server = await acquireServer(workerInfo.parallelIndex);
    try { await use(server); } finally { await server.stop(); }
  }, { scope: 'worker' }],
  baseURL: async ({ sbServer }, use) => { await use(sbServer.url); },
});
const { expect } = base;

// 外部(Google Fonts 等)へは出さない。図・DSL を外へ送らないためと、オフラインで load が止まらないため
async function blockExternal(page) {
  await page.route(url => !/^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:)/.test(url.href), route => route.abort());
}

// localStorage を消した素の状態で stableblock.html を開く
async function bootPlain(page) {
  await blockExternal(page);
  await page.goto('/stableblock.html');
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* file:// 等 */ } });
  await page.reload();
  await expect(page.locator('#svg-wrap svg')).toBeVisible();
}

// Import(ツールバーの「.sb 読込」)の filechooser で .sb を開き、読込が終わるまで待つ
async function importSb(page, file) {
  const expected = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');   // FileReader.readAsText は BOM を落とす
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '.sb 読込' }).click(),
  ]);
  await chooser.setFiles(file);
  await page.waitForFunction(e => typeof dsl === 'string' && dsl === e, expected);   // eslint-disable-line no-undef
}

// 本文欄(左の DSL エディタ)の表示テキスト。textarea は CRLF を LF にして返す
async function getEditorText(page) {
  return page.locator('#editor').inputValue();
}

// テストの保存先(test-results/ 配下のみ。リポジトリ直下には作らない)
function saveDir(testInfo) {
  const dir = testInfo.outputPath('save');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Export(ツールバーの「.sb 保存」)で .sb を受け取り、dir に保存する。返り値 { file, bytes }
async function exportSb(page, dir) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '.sb 保存' }).click(),
  ]);
  const file = path.join(dir, download.suggestedFilename() || 'diagram.sb');
  await download.saveAs(file);
  return { file, bytes: fs.readFileSync(file) };
}

const FIXTURES = path.join(REPO, 'tests', 'e2e', 'fixtures');

module.exports = { test, expect, bootPlain, importSb, getEditorText, exportSb, saveDir, FIXTURES, REPO };
