// E2E の静的サーバ: Playwright の worker ごとに `python -m http.server {port} --directory {repo}` を 1 つ持つ。
// - port は SB_PORT(無ければ 8901)+ worker の parallelIndex から上へ、何も LISTEN していないものを使う
// - worker 0 は SB_PORT が既に 200 を返し、かつこのリポジトリを配信していれば、それを再利用する(builder が build-env.ps1 で起こした server)
// - 割り当ては test-results/e2e-ports.json。終了時に止めるのは自分が起こした分だけ
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const RESULTS = path.join(REPO, 'test-results');
const PORTS_FILE = path.join(RESULTS, 'e2e-ports.json');
const DEFAULT_BASE = 8901;
const SCAN = 40;

function get(port, urlPath, timeoutMs = 2000) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: urlPath, timeout: timeoutMs }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

// その port の server がこのリポジトリを配信しているかを、test-results/ に置いた使い捨てのトークンで確かめる
async function servesThisRepo(port) {
  fs.mkdirSync(RESULTS, { recursive: true });
  const name = `.e2e-owner-${port}-${crypto.randomBytes(4).toString('hex')}.txt`;
  const token = crypto.randomBytes(8).toString('hex');
  const file = path.join(RESULTS, name);
  fs.writeFileSync(file, token);
  try {
    const r = await get(port, `/test-results/${name}`);
    return !!r && r.status === 200 && r.body === token;
  } finally {
    fs.rmSync(file, { force: true });
  }
}

function recordPort(index, entry) {
  fs.mkdirSync(RESULTS, { recursive: true });
  let all = {};
  try { all = JSON.parse(fs.readFileSync(PORTS_FILE, 'utf8')); } catch { /* 初回 */ }
  if (entry) all[index] = entry; else delete all[index];
  fs.writeFileSync(PORTS_FILE, JSON.stringify(all, null, 2) + '\n');
}

async function startOn(port) {
  const proc = spawn('python', ['-m', 'http.server', String(port), '--directory', REPO], { cwd: REPO, stdio: 'ignore', windowsHide: true });
  let exited = false;
  proc.on('exit', () => { exited = true; });
  proc.on('error', () => { exited = true; });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !exited) {
    await new Promise(r => setTimeout(r, 200));
    const r = await get(port, '/stableblock.html');
    if (r && r.status === 200) {
      if (!exited && await servesThisRepo(port)) return proc;
      break;
    }
  }
  if (!exited) proc.kill();
  return null;
}

// worker 1 つ分の server を用意する。返り値 { port, url, owned, stop() }
async function acquireServer(parallelIndex) {
  const envPort = process.env.SB_PORT ? Number(process.env.SB_PORT) : null;
  const base = envPort || DEFAULT_BASE;
  if (parallelIndex === 0 && envPort) {
    const r = await get(envPort, '/stableblock.html');
    if (r && r.status === 200 && await servesThisRepo(envPort)) {
      recordPort(parallelIndex, { port: envPort, pid: null, owned: false });
      return { port: envPort, url: `http://127.0.0.1:${envPort}`, owned: false, stop: async () => recordPort(parallelIndex, null) };
    }
  }
  for (let port = base + parallelIndex; port < base + parallelIndex + SCAN; port++) {
    if (port === envPort && parallelIndex !== 0) continue;
    if (await get(port, '/', 500)) continue;   // 何かが応答している = 他体の server
    const proc = await startOn(port);
    if (!proc) continue;
    recordPort(parallelIndex, { port, pid: proc.pid, owned: true });
    return {
      port, url: `http://127.0.0.1:${port}`, owned: true,
      stop: async () => { proc.kill(); recordPort(parallelIndex, null); },
    };
  }
  throw new Error(`E2E server: ${base + parallelIndex} から ${SCAN} 個の port で起動できなかった`);
}

module.exports = { acquireServer, REPO, RESULTS };
