# Obsidian Canvas(JSON Canvas 1.0)エクスポート 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** StableBlock の図を Obsidian Canvas(`.canvas`、JSON Canvas 1.0)としてエクスポートできるようにする(HTML版+VSCode拡張)。

**Architecture:** 純粋関数エミッタ `core/canvas/emitter.mjs` を新設し、core/excel・core/label で確立済みの「ESM + browser build + 実行時注入 + prepackage同梱」パターンに載せる。UI は既存エクスポート(Mermaid等)と同型のボタン+保存フロー。

**Tech Stack:** Vanilla JS(ESM)、Node built-in test runner(`node --test`)、JSON Canvas 1.0

**Spec:** `docs/superpowers/specs/2026-07-14-jsoncanvas-export-design.md`(承認済み。マッピング・損失一覧・QAログはここに従う)

## Global Constraints

- 作業ブランチ: `feature/jsoncanvas-export`(作成済み。main への直接コミット禁止)
- 標準 JSON Canvas 1.0 のみ。Advanced Canvas 拡張属性は出力しない
- note・注釈接続は `opts.showAnnotations` が true のときのみ出力(WYSIWYG)
- ノードID=StableBlock id 流用、エッジID=`e-<from>-<to>-<出力順連番>`、色=HEXパススルー、JSON=タブインデント、単方向は fromEnd/toEnd 省略・双方向のみ `fromEnd:"arrow"`、空ラベルは label キー省略
- 通常接続の端点解決は blocks のみ、注釈接続は blocks+notes(groups は端点にならない — 現行レンダラと同じ)。端点が見つからない接続は出力しない
- emitter は DOM API 使用禁止(純粋関数)。`parsed` の配列(blocks/groups/notes/connections)と `canvas.grid` のみに依存し、blockMap/noteMap 等のマップフィールドには依存しない(HTML版と拡張版で parsed の形が微妙に違うため)
- **extension.js の Webview コードは巨大テンプレートリテラル内**: バッククォート・`${}` 禁止、文字列中の改行は `\\n`、閉じscriptタグは `<\/script>`(既存規約)
- git add はファイル個別指定(`docs/ecn/` が未追跡のため)
- 既知: `npm test` は core/excel の既存2件fail(ブランチ以前からのCRLF環境問題)を除き全PASSが期待値。`npm run build:browser` は excel 生成物2ファイルを改行差異で touch する副作用あり(改行のみの差分なら `git checkout --` で復元してよい)
- Playwright MCP は file:// をブロック → HTML版の実機確認はローカルHTTPサーバー(`python -m http.server`)経由

## File Structure

| ファイル | 種別 | 責務 |
|---|---|---|
| `core/canvas/emitter.mjs` | 新規 | chooseSides / buildCanvas / canvasJson(純粋関数) |
| `core/canvas/emitter.browser.js` | 生成物(コミットする) | browser版(`window.StableBlockCanvas`) |
| `core/canvas/__tests__/emitter.test.mjs` | 新規 | 単体テスト+goldenテスト |
| `core/excel/build-browser.mjs` | 変更 | canvas emitter の browser build 追加 |
| `core/excel/__tests__/build-browser.test.mjs` | 変更 | canvas のドリフト検出テスト追加(改行正規化付き) |
| `package.json` | 変更 | test glob に core/canvas を追加 |
| `stableblock.html` | 変更 | script src / Canvasボタン / exportCanvas() |
| `vscode-stableblock/src/extension.js` | 変更 | emitter注入 / ツールバーボタン / webview exportCanvas / host保存ハンドラ |
| `vscode-stableblock/scripts/prepackage-core.js` | 変更 | ASSETS に emitter.mjs 追加 |
| `CHANGELOG.md` | 変更 | 機能追記(Task 5) |

---

### Task 1: 共有エミッタ core/canvas/emitter.mjs

**Files:**
- Create: `core/canvas/emitter.mjs`
- Create: `core/canvas/__tests__/emitter.test.mjs`
- Modify: `package.json`(test / test:watch の glob)

**Interfaces:**
- Consumes: なし(純粋関数のみ)
- Produces(後続タスクが依存する正確なシグネチャ):
  - `chooseSides(fromItem, toItem)` → `{fromSide, toSide}`(値: 'top'|'bottom'|'left'|'right')— 既存 `getSide()`(stableblock.html:349-354)/`gSide()` と同一のギャップ比較式
  - `buildCanvas(parsed, opts)` → `{nodes: [...], edges: [...]}` — opts=`{showAnnotations: boolean}`
  - `canvasJson(parsed, opts)` → string — `JSON.stringify(buildCanvas(...), null, '\t')`

- [ ] **Step 1: 失敗するテストを書く**

`core/canvas/__tests__/emitter.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseSides, buildCanvas, canvasJson } from '../emitter.mjs';

// 共有フィクスチャ: 2ブロック+グループ+note+接続4本(通常/双方向/注釈/欠損ID)
function fixture() {
  return {
    canvas: { width: 960, height: 640, grid: 20 },
    blocks: [
      { type: 'block', id: 'a', label: 'A\\nsub', x: 2, y: 2, w: 8, h: 3, color: '#6366F1' },
      { type: 'block', id: 'b', label: 'B', x: 30, y: 2, w: 8, h: 3, color: '#3B82F6' },
    ],
    groups: [
      { type: 'group', id: 'app', label: 'App', x: 1, y: 1, w: 40, h: 6, color: '#F3F4F6' },
    ],
    notes: [
      { type: 'note', id: 'memo', label: 'メモ', x: 2, y: 10, w: 6, h: 2, color: '#FEF3C7' },
    ],
    connections: [
      { from: 'a', to: 'b', label: 'payload', color: '#64748B', bidir: false },
      { from: 'b', to: 'a', label: '', color: '#EF4444', bidir: true },
      { from: 'memo', to: 'a', label: '', color: '#F59E0B', bidir: false },
      { from: 'a', to: 'ghost', label: '', color: '#000000', bidir: false },
    ],
  };
}

test('chooseSides matches legacy getSide gap comparison', () => {
  // 水平: a(2,2,8x3) → b(30,2,8x3): gapR=30-10=20 が最大
  assert.deepEqual(
    chooseSides({ x: 2, y: 2, w: 8, h: 3 }, { x: 30, y: 2, w: 8, h: 3 }),
    { fromSide: 'right', toSide: 'left' });
  // 逆方向: gapL=30-10=20
  assert.deepEqual(
    chooseSides({ x: 30, y: 2, w: 8, h: 3 }, { x: 2, y: 2, w: 8, h: 3 }),
    { fromSide: 'left', toSide: 'right' });
  // 垂直: memo(2,10,6x2) → a(2,2,8x3): gapT=10-5=5 が最大
  assert.deepEqual(
    chooseSides({ x: 2, y: 10, w: 6, h: 2 }, { x: 2, y: 2, w: 8, h: 3 }),
    { fromSide: 'top', toSide: 'bottom' });
  // 下方向: a → memo
  assert.deepEqual(
    chooseSides({ x: 2, y: 2, w: 8, h: 3 }, { x: 2, y: 10, w: 6, h: 2 }),
    { fromSide: 'bottom', toSide: 'top' });
});

test('buildCanvas: nodes are groups then blocks, grid*20 px, \\n converted', () => {
  const { nodes } = buildCanvas(fixture(), { showAnnotations: false });
  assert.deepEqual(nodes, [
    { id: 'app', type: 'group', label: 'App', x: 20, y: 20, width: 800, height: 120, color: '#F3F4F6' },
    { id: 'a', type: 'text', text: 'A\nsub', x: 40, y: 40, width: 160, height: 60, color: '#6366F1' },
    { id: 'b', type: 'text', text: 'B', x: 600, y: 40, width: 160, height: 60, color: '#3B82F6' },
  ]);
});

test('buildCanvas: normal edges with sides, label omitted when empty, bidir fromEnd', () => {
  const { edges } = buildCanvas(fixture(), { showAnnotations: false });
  assert.deepEqual(edges, [
    { id: 'e-a-b-0', fromNode: 'a', fromSide: 'right', toNode: 'b', toSide: 'left', color: '#64748B', label: 'payload' },
    { id: 'e-b-a-1', fromNode: 'b', fromSide: 'left', toNode: 'a', toSide: 'right', color: '#EF4444', fromEnd: 'arrow' },
  ]);
});

test('buildCanvas: missing-endpoint connection is dropped and does not consume seq', () => {
  const { edges } = buildCanvas(fixture(), { showAnnotations: false });
  assert.equal(edges.length, 2);
  assert.ok(!edges.some((e) => e.toNode === 'ghost'));
});

test('buildCanvas: showAnnotations=true adds note node and annotation edge at the end', () => {
  const { nodes, edges } = buildCanvas(fixture(), { showAnnotations: true });
  assert.deepEqual(nodes[3],
    { id: 'memo', type: 'text', text: 'メモ', x: 40, y: 200, width: 120, height: 40, color: '#FEF3C7' });
  assert.deepEqual(edges[2],
    { id: 'e-memo-a-2', fromNode: 'memo', fromSide: 'top', toNode: 'a', toSide: 'bottom', color: '#F59E0B' });
});

test('buildCanvas: showAnnotations=false excludes notes and annotation edges', () => {
  const { nodes, edges } = buildCanvas(fixture(), { showAnnotations: false });
  assert.equal(nodes.length, 3);
  assert.equal(edges.length, 2);
});

test('canvasJson: golden output with tab indent', () => {
  const json = canvasJson(fixture(), { showAnnotations: false });
  const parsed = JSON.parse(json);
  assert.deepEqual(parsed, buildCanvas(fixture(), { showAnnotations: false }));
  assert.ok(json.startsWith('{\n\t"nodes": ['));
  assert.ok(json.includes('\n\t\t{\n\t\t\t"id": "app",'));
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test "core/canvas/__tests__/emitter.test.mjs"`
Expected: FAIL — `Cannot find module '../emitter.mjs'`

- [ ] **Step 3: 最小実装を書く**

`core/canvas/emitter.mjs`:

```js
// StableBlock parsed オブジェクト → JSON Canvas 1.0 (https://jsoncanvas.org/spec/1.0/)。
// 純粋関数のみ(DOM API 禁止)。browser 版は core/excel/build-browser.mjs が
// emitter.browser.js を生成する(window.StableBlockCanvas)。
// 依存は parsed の配列(blocks/groups/notes/connections)と canvas.grid のみ
// (blockMap/noteMap の形が HTML版と拡張版で異なるため、マップは内部で構築する)。

// 既存レンダラの getSide()/gSide() と同一のギャップ比較式。
// ポート按分(cPorts)は Canvas に表現手段がないため移植しない。
export function chooseSides(fromItem, toItem) {
  const gapB = toItem.y - (fromItem.y + fromItem.h);
  const gapT = fromItem.y - (toItem.y + toItem.h);
  const gapR = toItem.x - (fromItem.x + fromItem.w);
  const gapL = fromItem.x - (toItem.x + toItem.w);
  const vBest = Math.max(gapB, gapT), hBest = Math.max(gapR, gapL);
  if (vBest >= hBest) {
    return gapB >= gapT
      ? { fromSide: 'bottom', toSide: 'top' }
      : { fromSide: 'top', toSide: 'bottom' };
  }
  return gapR >= gapL
    ? { fromSide: 'right', toSide: 'left' }
    : { fromSide: 'left', toSide: 'right' };
}

function toText(label) {
  return String(label).replace(/\\n/g, '\n');
}

export function buildCanvas(parsed, opts) {
  const showAnnotations = !!(opts && opts.showAnnotations);
  const g = parsed.canvas.grid;
  const blockMap = {};
  for (const b of parsed.blocks) blockMap[b.id] = b;
  const noteMap = {};
  for (const n of parsed.notes) noteMap[n.id] = n;

  const nodes = [];
  for (const gr of parsed.groups) {
    nodes.push({ id: gr.id, type: 'group', label: gr.label, x: gr.x * g, y: gr.y * g, width: gr.w * g, height: gr.h * g, color: gr.color });
  }
  for (const b of parsed.blocks) {
    nodes.push({ id: b.id, type: 'text', text: toText(b.label), x: b.x * g, y: b.y * g, width: b.w * g, height: b.h * g, color: b.color });
  }
  if (showAnnotations) {
    for (const n of parsed.notes) {
      nodes.push({ id: n.id, type: 'text', text: toText(n.label), x: n.x * g, y: n.y * g, width: n.w * g, height: n.h * g, color: n.color });
    }
  }

  // 注釈接続=端点のどちらかが note(既存 isAnnotationConn と同一基準)
  const isAnno = (c) => !!(noteMap[c.from] || noteMap[c.to]);
  const edges = [];
  let seq = 0;
  const emit = (c, endpointMap) => {
    const from = endpointMap[c.from], to = endpointMap[c.to];
    if (!from || !to) return;
    const sides = chooseSides(from, to);
    const edge = {
      id: 'e-' + c.from + '-' + c.to + '-' + seq,
      fromNode: c.from, fromSide: sides.fromSide,
      toNode: c.to, toSide: sides.toSide,
      color: c.color,
    };
    if (c.bidir) edge.fromEnd = 'arrow';
    if (c.label) edge.label = c.label;
    edges.push(edge);
    seq++;
  };
  // 通常接続(端点=blocksのみ)→ 注釈接続(端点=blocks+notes)の順(現行レンダラと同じ扱い)
  const annoMap = Object.assign({}, blockMap, noteMap);
  for (const c of parsed.connections) {
    if (!isAnno(c)) emit(c, blockMap);
  }
  if (showAnnotations) {
    for (const c of parsed.connections) {
      if (isAnno(c)) emit(c, annoMap);
    }
  }
  return { nodes, edges };
}

export function canvasJson(parsed, opts) {
  return JSON.stringify(buildCanvas(parsed, opts), null, '\t');
}
```

- [ ] **Step 4: package.json の test glob に core/canvas を追加**

```json
"test": "node --test \"core/excel/__tests__/*.test.mjs\" \"core/label/__tests__/*.test.mjs\" \"core/canvas/__tests__/*.test.mjs\"",
"test:watch": "node --test --watch \"core/excel/__tests__/*.test.mjs\" \"core/label/__tests__/*.test.mjs\" \"core/canvas/__tests__/*.test.mjs\"",
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npm test`
Expected: core/canvas の7テスト含め、既知の excel CRLF 2件fail以外すべて PASS

- [ ] **Step 6: コミット**

```bash
git add core/canvas/emitter.mjs core/canvas/__tests__/emitter.test.mjs package.json
git commit -m "feat(canvas): JSON Canvas 1.0 エミッタ core/canvas を新設"
```

---

### Task 2: browser build 拡張とドリフト検出

**Files:**
- Modify: `core/excel/build-browser.mjs`(`buildLabelCoreBrowser` L98 の直後、`main()` L113-117 付近)
- Modify: `core/excel/__tests__/build-browser.test.mjs`
- Create(生成): `core/canvas/emitter.browser.js`

**Interfaces:**
- Consumes: Task 1 の `core/canvas/emitter.mjs`(export 3関数)、既存 `buildBrowserGlobal(source, globalName, srcLabel)`
- Produces: `core/canvas/emitter.browser.js` — `window.StableBlockCanvas = { chooseSides, buildCanvas, canvasJson }` を公開する classic script。`buildCanvasEmitterBrowser(source)`(ドリフトテストが使用)

- [ ] **Step 1: 失敗するドリフトテストを追加**

`core/excel/__tests__/build-browser.test.mjs` に追記(import に `buildCanvasEmitterBrowser` を追加。既存の label-core ドリフトテストと同じ改行正規化パターン):

```js
test('canvas emitter.browser.js is up to date (drift detection)', () => {
  const src = readFileSync(new URL('../../canvas/emitter.mjs', import.meta.url), 'utf8');
  const built = readFileSync(new URL('../../canvas/emitter.browser.js', import.meta.url), 'utf8');
  const norm = (s) => s.replace(/\r\n/g, '\n');
  assert.equal(norm(built), norm(buildCanvasEmitterBrowser(norm(src))),
    'Run `npm run build:browser` to regenerate canvas emitter.browser.js');
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL — `buildCanvasEmitterBrowser` not exported / emitter.browser.js not found

- [ ] **Step 3: build-browser.mjs を拡張**

`buildLabelCoreBrowser`(L98-100)の直後に追加:

```js
export function buildCanvasEmitterBrowser(source) {
  return buildBrowserGlobal(source, 'StableBlockCanvas', 'core/canvas/emitter.mjs');
}
```

`main()` の label-core 出力(L113-117)の直後に追加:

```js
  const CANVAS_SRC = join(__dirname, '..', 'canvas', 'emitter.mjs');
  const OUT_CANVAS_BROWSER = join(__dirname, '..', 'canvas', 'emitter.browser.js');
  const canvasSource = readFileSync(CANVAS_SRC, 'utf8');
  writeFileSync(OUT_CANVAS_BROWSER, buildCanvasEmitterBrowser(canvasSource));
  console.log(`Wrote: ${OUT_CANVAS_BROWSER}`);
```

- [ ] **Step 4: 生成を実行してテストが通ることを確認**

Run: `npm run build:browser` → `npm test`
Expected: `Wrote: ...core/canvas/emitter.browser.js` が出力され、既知2件fail以外PASS。excel 生成物2ファイルに改行のみの差分が出たら `git checkout -- core/excel/template-inline.js core/excel/emitter.browser.js` で復元

- [ ] **Step 5: コミット**

```bash
git add core/excel/build-browser.mjs core/excel/__tests__/build-browser.test.mjs core/canvas/emitter.browser.js
git commit -m "feat(canvas): canvas emitter の browser build とドリフト検出テストを追加"
```

---

### Task 3: HTML版 — Canvasボタンとエクスポート関数

**Files:**
- Modify: `stableblock.html`
  - L110 付近(`label-core.browser.js` の script src の次): script src 追加
  - L145(Mermaid ボタン): 隣に Canvas ボタン追加
  - L814 付近(`exportMermaid` の隣): `exportCanvas` 関数追加

**Interfaces:**
- Consumes: `window.StableBlockCanvas.canvasJson(parsed, {showAnnotations})`(Task 2 の browser build)、既存 `download(name, data)`(stableblock.html:805)、既存グローバル `parsed` / `showAnnotations`

- [ ] **Step 1: script src を追加**

`<script src="core/label/label-core.browser.js"></script>` の直後に追加:

```html
<script src="core/canvas/emitter.browser.js"></script>
```

- [ ] **Step 2: ツールバーに Canvas ボタンを追加**

L145 の Mermaid ボタンの直後に追加:

```html
    <button class="tb tb-accent" onclick="exportCanvas()" title="Obsidian Canvas形式で保存">Canvas</button>
```

- [ ] **Step 3: exportCanvas 関数を追加**

`exportMermaid`(L814)の直後に追加:

```js
function exportCanvas(){if(!parsed)return;download('diagram.canvas','data:application/json;charset=utf-8,'+encodeURIComponent(window.StableBlockCanvas.canvasJson(parsed,{showAnnotations})));}
```

- [ ] **Step 4: 構文サニティチェック**

`window.StableBlockCanvas`・`exportCanvas` への参照が対で存在すること、`grep -c 'exportCanvas' stableblock.html` が 2(ボタン+関数)であることを確認。ブラウザ実機確認は Task 5(コントローラー/evaluator)で実施。

- [ ] **Step 5: コミット**

```bash
git add stableblock.html
git commit -m "feat(html): Obsidian Canvas エクスポートボタンを追加"
```

---

### Task 4: VSCode拡張 — 注入・ボタン・保存ハンドラ・VSIX同梱

**Files:**
- Modify: `vscode-stableblock/src/extension.js`
  - L246 付近(labelCoreAsGlobals)の直後: canvas emitter の読込・export剥がし
  - L288(`<script>${labelCoreAsGlobals}<\/script>`)の直後: 注入 script タグ
  - L297(ツールバー、Excel ボタンの後): Canvas ボタン
  - L642 付近(webview の exportSVG 等の隣): webview 側 exportCanvas
  - L81-87(host の exportMmd ハンドラ)の直後: exportCanvas ハンドラ
- Modify: `vscode-stableblock/scripts/prepackage-core.js`(ASSETS L21-26)

**Interfaces:**
- Consumes: `core/canvas/emitter.mjs`(実行時読込)、既存 `REPO_ROOT`・`fs`・`path`、webview の `vscodeApi`・`parsed`・`showAnno`
- Produces(Webview内グローバル): `window.StableBlockCanvas`、`exportCanvas()`

**注意: Webview内コード(Step 3-4)はテンプレートリテラル内 — バッククォート・`${}` 禁止。行番号はズレている可能性があるためコード内容でアンカーすること。**

- [ ] **Step 1: extension host 側で emitter を読み込み注入する**

labelCoreAsGlobals の定義(L246 付近)の直後に追加:

```js
  let canvasEmitterScript = '';
  try {
    canvasEmitterScript = fs.readFileSync(path.join(REPO_ROOT, 'core', 'canvas', 'emitter.mjs'), 'utf8');
  } catch (e) {
    console.error('[stableblock] Failed to load canvas emitter:', e.message);
  }
  const canvasEmitterAsGlobals = canvasEmitterScript
    .replace(/^\s*export\s+(async\s+)?function\s+(\w+)/gm, '$1function $2')
    + '\n;window.StableBlockCanvas = { chooseSides, buildCanvas, canvasJson };';
```

`<script>${labelCoreAsGlobals}<\/script>`(L288)の直後に追加:

```
<script>${canvasEmitterAsGlobals}<\/script>
```

- [ ] **Step 2: host 側の保存ハンドラを追加**

`exportMmd` ハンドラ(L81-87)の直後に、同じ構造で追加(showInformationMessage 等の有無は隣の exportMmd ハンドラの実装に正確に合わせること):

```js
        if (msg.type === "exportCanvas") {
          const uri = await vscode.window.showSaveDialog({ filters: { "Canvas": ["canvas"] }, defaultUri: vscode.Uri.file("diagram.canvas") });
          if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(msg.data, "utf-8"));
          }
          return;
        }
```

- [ ] **Step 3: Webview ツールバーにボタンを追加**

L297 の Excel ボタン(`<button class="tb" onclick="exportXlsx()">Excel</button>`)の直後に追加:

```
<button class="tb" onclick="exportCanvas()">Canvas</button>
```

- [ ] **Step 4: Webview 側の exportCanvas を追加**

webview の `exportSVG`(L642 付近)の隣に追加(テンプレートリテラル規約に注意 — この行にバッククォート・`${}` はない):

```js
function exportCanvas(){if(!parsed)return;vscodeApi.postMessage({type:'exportCanvas',data:window.StableBlockCanvas.canvasJson(parsed,{showAnnotations:showAnno})});}
```

- [ ] **Step 5: prepackage-core.js の ASSETS に追加**

L21-26 の ASSETS 配列に追加:

```js
  path.join("core", "canvas", "emitter.mjs"),
```

- [ ] **Step 6: 検証**

```bash
node --check vscode-stableblock/src/extension.js
cd vscode-stableblock && npx vsce package --allow-missing-repository
```

生成された `.vsix` を unzip し、`extension/core/canvas/emitter.mjs` が含まれることをリスト表示で確認(PR #14 の Critical 再発防止)。
Expected: 構文OK・パッケージ成功・emitter.mjs 同梱

- [ ] **Step 7: コミット**

```bash
git add vscode-stableblock/src/extension.js vscode-stableblock/scripts/prepackage-core.js
git commit -m "feat(vscode): Obsidian Canvas エクスポートを追加(emitter注入+保存ハンドラ+VSIX同梱)"
```

---

### Task 5: 実機検証と CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`([Unreleased] > Added)
- Create: `.eval/jsoncanvas-export/`(検証エビデンス)

**Interfaces:**
- Consumes: Task 3-4 完了済みの HTML版/拡張

- [ ] **Step 1: HTML版の実機確認(Playwright、ローカルHTTPサーバー経由)**

`python -m http.server <port>` をリポジトリルートで起動し、`http://localhost:<port>/stableblock.html` を開いて:
1. コンソールエラーなし(favicon 404 は既知・無害)
2. Canvas ボタンが表示される
3. `browser_evaluate` で `window.StableBlockCanvas.canvasJson(parsed,{showAnnotations})` を直接呼び、返却JSONが `JSON.parse` 可能で `nodes`/`edges` を含み、ノード数=ブロック+グループ数と一致すること
4. 注釈レイヤー表示をトグルして 3. を再実行し、note ノードの有無が切り替わること

Expected: 4点OK。スクリーンショットとJSONを `.eval/jsoncanvas-export/` に保存

- [ ] **Step 2: Obsidian 実機確認**

出力した `diagram.canvas` を Obsidian vault に配置して開き、ノード・グループ・エッジ(ラベル・双方向矢印)が表示されることを確認する。`obsidian-cli` スキル(vault操作+スクリーンショット)が使える環境なら自動化し、エビデンスを `.eval/jsoncanvas-export/` に保存。使えなければ**ユーザー受入項目**として報告に明記(勝手にPASS扱いしない)。

- [ ] **Step 3: CHANGELOG.md に追記**

[Unreleased] > Added に(既存のフラットな `- ` 箇条書きスタイルで):

```markdown
- Obsidian Canvas(JSON Canvas 1.0、.canvas)エクスポートを追加(HTML版/VSCode拡張)。注釈レイヤーは表示状態に従い出力
```

- [ ] **Step 4: 全テスト最終確認とコミット**

```bash
npm test   # 既知2件fail以外PASS
git add CHANGELOG.md .eval/jsoncanvas-export/
git commit -m "test(eval): Canvas エクスポートの実機検証エビデンスと CHANGELOG 追記"
```

---

## 実施ログ

(実装時に記録を追記する)

## Self-Review 結果

- スペック全節がタスクにマップされていることを確認(§1マッピング→T1、§2辺選択→T1 chooseSides、§3 browser build→T2、§4 HTML版→T3、§5拡張→T4(prepackage含む)、§6検証→T1テスト+T5、§7スコープ外=タスクなしが正)
- プレースホルダなし(全ステップに実コード・実コマンド・期待値)
- 型整合: `chooseSides`/`buildCanvas`/`canvasJson` のシグネチャと呼び出し(T3/T4)が一致。golden テストの座標・辺選択は手計算で検証済み(a→b: gapR=20→right/left、memo→a: gapT=5→top/bottom、memo node: x=40,y=200,w=120,h=40)
