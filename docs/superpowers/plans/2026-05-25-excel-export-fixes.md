# Excel エクスポート視覚再現修正 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 1 Excel エクスポート実装の 3 視覚バグ（角の丸み、フォント、改行）と 1 アーキ問題（HTML 版が file:// で動かない）を修正する。

**Architecture:** `core/excel/emitter.js` の 3 つのシェイプビルダー関数を順次パッチし（TDD で1関心ずつ）、続いて HTML 版の `<script type="module">` + `fetch()` 構成を `<script src>` 3 つに置き換えるための派生ファイル (`template-inline.js`, `emitter.browser.js`) をビルドスクリプトで生成する。生成ファイルは git にコミットし、drift 検出テストで「ソース編集後に build:browser 実行を忘れる」事故を防ぐ。

**Tech Stack:** Node.js (組み込み `node:test`), JSZip, OOXML Drawing XML, ES module → script transform.

**前提:** `feat/excel-export-design` ブランチで作業（PR #12 への追加コミットとして含める）。

---

## ファイル構成

### 既存（修正対象）

| ファイル | 修正内容 |
|---|---|
| `core/excel/emitter.js` | `buildBlockShape` / `buildGroupShape` / `buildConnectionLabel` を変更 |
| `core/excel/xlsx-emit-spec.md` | 仕様の正典を更新（adj 算出式、font、autoFit、改行ルール） |
| `core/excel/__tests__/shape-builder.test.mjs` | 既存 newline テストを修正、新規テストを追加 |
| `core/excel/fixtures/basic.expected-drawing.xml` | 再生成（adj、font、autoFit 反映） |
| `core/excel/fixtures/with-group.expected-drawing.xml` | 再生成 |
| `core/excel/fixtures/with-note.expected-drawing.xml` | 再生成 |
| `stableblock.html` | `<script type="module">` + `fetch()` ブロックを `<script src>` 3 つに置き換え |
| `README.md` | 「`start-html.bat`」言及を「`stableblock.html` をブラウザで開くだけ」に戻す |
| `docs/superpowers/specs/2026-05-21-excel-export-acceptance.md` | start-html.bat 言及を削除 |

### 新規

| ファイル | 責務 |
|---|---|
| `core/excel/build-browser.mjs` | template-skeleton/ と emitter.js から `template-inline.js` と `emitter.browser.js` を生成。`buildTemplateInline()` / `buildEmitterBrowser()` を export して drift テストから再利用可能にする。 |
| `core/excel/template-inline.js` | **自動生成**。`window.StableBlockTemplateFiles = {...};` を設定 |
| `core/excel/emitter.browser.js` | **自動生成**。emitter.js から `export` を除去し末尾に `window.StableBlockExcel = {...};` を追加 |
| `core/excel/__tests__/build-browser.test.mjs` | drift 検出テスト |

### 削除

| ファイル | 理由 |
|---|---|
| `start-html.bat` | HTML が file:// で完結するため不要 |

---

## Phase 1: コードバグ修正 (TDD)

### Task 1.1: `xlsx-emit-spec.md` を新仕様で更新

**Files:**
- Modify: `core/excel/xlsx-emit-spec.md`

- [ ] **Step 1: Block セクション (L26〜) の Emit ブロック内の `<a:bodyPr>` と `<a:rPr>` を更新**

該当箇所:
```xml
      <a:bodyPr wrap="square" anchor="ctr"/>
      <a:lstStyle/>
      <a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ja-JP" sz="1100"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>UI</a:t></a:r></a:p>
```

これを次に置き換え:
```xml
      <a:bodyPr wrap="square" anchor="ctr"><a:normAutofit/></a:bodyPr>
      <a:lstStyle/>
      <a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ja-JP" sz="1100"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:latin typeface="Calibri"/><a:ea typeface="Yu Gothic UI"/></a:rPr><a:t>UI</a:t></a:r></a:p>
```

- [ ] **Step 2: Block セクションの「ルール:」行を更新**

該当箇所:
```
- `round=N` → `<a:gd name="adj" fmla="val M"/>`, M = round * 5000 を上限 50000
```

これを置き換え:
```
- `round=N` → `<a:gd name="adj" fmla="val M"/>`, M = round(N / min(w*grid, h*grid) * 100000) を上限 50000
  - SVG の `rx` ピクセル値に対応。短辺ピクセル長に対する比率として OOXML adj を算出
- `\n`（2 文字: バックスラッシュ + n）または改行コードでラベルを分割し、各行を別々の `<a:p>` に格納
- `<a:bodyPr>` 内に `<a:normAutofit/>` を入れて、テキスト溢れ時に Excel が自動でフォントサイズ縮小
- `<a:rPr>` 内に `<a:latin typeface="Calibri"/>` と `<a:ea typeface="Yu Gothic UI"/>` を明示
```

- [ ] **Step 3: Group セクションの Emit 内 `<a:rPr>` にフォント指定を追加**

該当箇所:
```xml
<a:p><a:pPr algn="l"/><a:r><a:rPr lang="ja-JP" sz="900" b="1"><a:solidFill><a:srgbClr val="475569"/></a:solidFill></a:rPr><a:t>Application</a:t></a:r></a:p>
```

これを置き換え:
```xml
<a:p><a:pPr algn="l"/><a:r><a:rPr lang="ja-JP" sz="900" b="1"><a:solidFill><a:srgbClr val="475569"/></a:solidFill><a:latin typeface="Calibri"/><a:ea typeface="Yu Gothic UI"/></a:rPr><a:t>Application</a:t></a:r></a:p>
```

- [ ] **Step 4: Connection ラベル TextBox セクションの `<a:rPr>` にフォント指定を追加**

該当箇所:
```xml
<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ja-JP" sz="900"><a:solidFill><a:srgbClr val="64748B"/></a:solidFill></a:rPr><a:t>LABEL</a:t></a:r></a:p>
```

これを置き換え:
```xml
<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ja-JP" sz="900"><a:solidFill><a:srgbClr val="64748B"/></a:solidFill><a:latin typeface="Calibri"/><a:ea typeface="Yu Gothic UI"/></a:rPr><a:t>LABEL</a:t></a:r></a:p>
```

- [ ] **Step 5: 「## ブラウザ向け派生ファイル」セクションをファイル末尾に追加**

```markdown

## ブラウザ向け派生ファイル

`file://` で `<script type="module">` import と `fetch()` がブロックされるため、HTML 版用に派生ファイルを git にコミットする:

- `core/excel/template-inline.js`: `window.StableBlockTemplateFiles = {...}` を設定（テンプレート 7 ファイル分の文字列を JSON 埋め込み）
- `core/excel/emitter.browser.js`: emitter.js から `export` キーワードを除去し、末尾に `window.StableBlockExcel = { 全 export 関数名 }` を追加

これらは `core/excel/build-browser.mjs` で自動生成され、`npm run build:browser` で再生成可能。drift 検出テスト (`__tests__/build-browser.test.mjs`) でソースと出力の整合性を CI 担保する。
```

- [ ] **Step 6: コミット**

```bash
git add core/excel/xlsx-emit-spec.md
git commit -m "docs(excel-spec): update Block/Group/Connection rules with font, autoFit, pixel-based adj"
```

---

### Task 1.2: 改行修正 (Bug #3) — DSL の 2-char `\n` で split

**Files:**
- Modify: `core/excel/emitter.js:64`
- Modify: `core/excel/__tests__/shape-builder.test.mjs:73-83`

- [ ] **Step 1: 既存 newline テストを書き換え + 新規テストを追加**

`core/excel/__tests__/shape-builder.test.mjs` の L73-83 のテスト全体を以下に置き換え:

```javascript
test('buildBlockShape: \\n (DSL 2-char backslash-n) splits into multiple <a:p>', () => {
  // DSL parser keeps "Line1\nLine2" as 12 chars: L,i,n,e,1,\,n,L,i,n,e,2
  const block = {
    id: 'a', label: 'Line1\\nLine2',  // JS literal -> 12 chars including backslash-n
    x: 0, y: 0, w: 2, h: 2,
    color: '#FFFFFF', textColor: '#000000',
    borderColor: null, round: 0, style: 'solid'
  };
  const xml = buildBlockShape(block, 1, 20);
  const pCount = (xml.match(/<a:p>/g) || []).length;
  assert.equal(pCount, 2);
  assert.ok(xml.includes('<a:t>Line1</a:t>'));
  assert.ok(xml.includes('<a:t>Line2</a:t>'));
  assert.ok(!xml.includes('\\n'), 'literal backslash-n should not appear in output');
});

test('buildBlockShape: real newline char also splits', () => {
  const block = {
    id: 'a', label: 'Line1\nLine2',  // JS literal -> 11 chars with real newline
    x: 0, y: 0, w: 2, h: 2,
    color: '#FFFFFF', textColor: '#000000',
    borderColor: null, round: 0, style: 'solid'
  };
  const xml = buildBlockShape(block, 1, 20);
  const pCount = (xml.match(/<a:p>/g) || []).length;
  assert.equal(pCount, 2);
});

test('buildBlockShape: no newline produces single <a:p>', () => {
  const block = {
    id: 'a', label: 'OneLine',
    x: 0, y: 0, w: 2, h: 2,
    color: '#FFFFFF', textColor: '#000000',
    borderColor: null, round: 0, style: 'solid'
  };
  const xml = buildBlockShape(block, 1, 20);
  const pCount = (xml.match(/<a:p>/g) || []).length;
  assert.equal(pCount, 1);
});
```

- [ ] **Step 2: テスト実行 (一部 FAIL を確認)**

```bash
npm test 2>&1 | tail -20
```

期待: 「DSL 2-char backslash-n」テストが FAIL（現状の split は real newline でしか分割しないため `pCount === 1` になり、期待値 2 と不一致）。「real newline」と「no newline」は PASS。

- [ ] **Step 3: emitter.js L64 を修正**

`core/excel/emitter.js:64` を以下に置き換え:

```javascript
  const labelLines = String(block.label || '').split(/\\n|\r?\n/);
```

正規表現の解説:
- `\\n` は **バックスラッシュ + n の 2 文字** にマッチ（JS 正規表現リテラル内では `\\` でバックスラッシュ 1 文字を表す）
- `|\r?\n` で実際の改行（CRLF / LF）にもマッチ

- [ ] **Step 4: テスト実行（全 PASS を確認）**

```bash
npm test 2>&1 | tail -10
```

期待: `# pass 42, fail 0`（既存 40 + 新規 3 - 既存 1 件置換 = 42）

- [ ] **Step 5: コミット**

```bash
git add core/excel/emitter.js core/excel/__tests__/shape-builder.test.mjs
git commit -m "fix(excel): split label on DSL 2-char \\n in buildBlockShape (was only splitting real newline)"
```

---

### Task 1.3: autoFit 追加 (Bug #2 part 1)

**Files:**
- Modify: `core/excel/emitter.js:84`
- Modify: `core/excel/__tests__/shape-builder.test.mjs` (新規テスト追加)

- [ ] **Step 1: テストを追加**

`core/excel/__tests__/shape-builder.test.mjs` の末尾（最後のテストの後）に追加:

```javascript
test('buildBlockShape: bodyPr includes normAutofit', () => {
  const block = {
    id: 'a', label: 'A',
    x: 0, y: 0, w: 2, h: 2,
    color: '#FFFFFF', textColor: '#000000',
    borderColor: null, round: 0, style: 'solid'
  };
  const xml = buildBlockShape(block, 1, 20);
  assert.ok(xml.includes('<a:bodyPr wrap="square" anchor="ctr"><a:normAutofit/></a:bodyPr>'),
    'bodyPr should contain normAutofit for text auto-shrink');
});
```

- [ ] **Step 2: テスト実行 (FAIL を確認)**

```bash
npm test 2>&1 | grep -A2 "normAutofit"
```

期待: FAIL。現状の bodyPr は `<a:bodyPr wrap="square" anchor="ctr"/>` で normAutofit が無い。

- [ ] **Step 3: emitter.js L84 を修正**

`core/excel/emitter.js` の `buildBlockShape` 内、現在:
```javascript
        `<a:bodyPr wrap="square" anchor="ctr"/>` +
```

を以下に置き換え:
```javascript
        `<a:bodyPr wrap="square" anchor="ctr"><a:normAutofit/></a:bodyPr>` +
```

- [ ] **Step 4: テスト実行（PASS を確認）**

```bash
npm test 2>&1 | tail -10
```

期待: `# pass 43, fail 0`

- [ ] **Step 5: コミット**

```bash
git add core/excel/emitter.js core/excel/__tests__/shape-builder.test.mjs
git commit -m "feat(excel): add normAutofit to buildBlockShape bodyPr for text auto-shrink"
```

---

### Task 1.4: フォント明示 (Bug #2 part 2)

**Files:**
- Modify: `core/excel/emitter.js:66`
- Modify: `core/excel/__tests__/shape-builder.test.mjs` (新規テスト追加)

- [ ] **Step 1: テストを追加**

`core/excel/__tests__/shape-builder.test.mjs` の末尾に追加:

```javascript
test('buildBlockShape: rPr includes Calibri (latin) and Yu Gothic UI (ea) fonts', () => {
  const block = {
    id: 'a', label: 'A',
    x: 0, y: 0, w: 2, h: 2,
    color: '#FFFFFF', textColor: '#000000',
    borderColor: null, round: 0, style: 'solid'
  };
  const xml = buildBlockShape(block, 1, 20);
  assert.ok(xml.includes('<a:latin typeface="Calibri"/>'),
    'rPr should specify Calibri for Latin script');
  assert.ok(xml.includes('<a:ea typeface="Yu Gothic UI"/>'),
    'rPr should specify Yu Gothic UI for East Asian script');
});
```

- [ ] **Step 2: テスト実行 (FAIL を確認)**

```bash
npm test 2>&1 | grep -B1 -A2 "Calibri"
```

期待: FAIL。フォント未指定。

- [ ] **Step 3: emitter.js の `paragraphs` 構築を修正**

`core/excel/emitter.js` の L64-67 の現状:
```javascript
  const labelLines = String(block.label || '').split(/\\n|\r?\n/);
  const paragraphs = labelLines.map(line =>
    `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ja-JP" sz="1100"><a:solidFill><a:srgbClr val="${textColor}"/></a:solidFill></a:rPr><a:t>${escapeXml(line)}</a:t></a:r></a:p>`
  ).join('');
```

を以下に置き換え（`<a:rPr>` 内に `<a:latin>` と `<a:ea>` を追加）:
```javascript
  const labelLines = String(block.label || '').split(/\\n|\r?\n/);
  const paragraphs = labelLines.map(line =>
    `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ja-JP" sz="1100"><a:solidFill><a:srgbClr val="${textColor}"/></a:solidFill><a:latin typeface="Calibri"/><a:ea typeface="Yu Gothic UI"/></a:rPr><a:t>${escapeXml(line)}</a:t></a:r></a:p>`
  ).join('');
```

- [ ] **Step 4: テスト実行（PASS を確認）**

```bash
npm test 2>&1 | tail -10
```

期待: `# pass 44, fail 0`

- [ ] **Step 5: コミット**

```bash
git add core/excel/emitter.js core/excel/__tests__/shape-builder.test.mjs
git commit -m "feat(excel): add Calibri (latin) and Yu Gothic UI (ea) font specs to buildBlockShape"
```

---

### Task 1.5: adj ピクセル換算 (Bug #1)

**Files:**
- Modify: `core/excel/emitter.js:55-62`
- Modify: `core/excel/__tests__/shape-builder.test.mjs` (新規テスト追加 + 既存テスト修正)

- [ ] **Step 1: 既存の「round=8 includes adj value」テストを修正、新規テストを追加**

`core/excel/__tests__/shape-builder.test.mjs` の L50-60 の既存テスト全体を以下に置き換え:

```javascript
test('buildBlockShape: round=4 with shortPx=60 (h=3, gridPx=20) produces adj=6667', () => {
  // short side = min(w, h) * gridPx = 3 * 20 = 60 px
  // adj = round(4 / 60 * 100000) = 6667
  const block = {
    id: 'a', label: 'A',
    x: 0, y: 0, w: 10, h: 3,
    color: '#FFFFFF', textColor: '#000000',
    borderColor: null, round: 4, style: 'solid'
  };
  const xml = buildBlockShape(block, 1, 20);
  assert.ok(xml.includes('roundRect'));
  assert.ok(xml.includes('val 6667'), 'adj should be pixel-based: round(4/60*100000)=6667');
});

test('buildBlockShape: round=10 with shortPx=100 produces adj=10000 (10%)', () => {
  // shortPx = 5 * 20 = 100, adj = round(10/100 * 100000) = 10000
  const block = {
    id: 'a', label: 'A',
    x: 0, y: 0, w: 5, h: 5,
    color: '#FFFFFF', textColor: '#000000',
    borderColor: null, round: 10, style: 'solid'
  };
  const xml = buildBlockShape(block, 1, 20);
  assert.ok(xml.includes('val 10000'));
});

test('buildBlockShape: oversized round clamps adj to 50000 (50%)', () => {
  // shortPx = 2 * 20 = 40, round=100 would give 250000, clamped to 50000
  const block = {
    id: 'a', label: 'A',
    x: 0, y: 0, w: 2, h: 2,
    color: '#FFFFFF', textColor: '#000000',
    borderColor: null, round: 100, style: 'solid'
  };
  const xml = buildBlockShape(block, 1, 20);
  assert.ok(xml.includes('val 50000'));
});
```

- [ ] **Step 2: テスト実行 (FAIL を確認)**

```bash
npm test 2>&1 | tail -20
```

期待: 3 件すべて FAIL。現状の adj は `round * 5000` なので、`round=4` → `adj=20000`（テストは 6667 を期待）。

- [ ] **Step 3: emitter.js L55-62 を修正**

`core/excel/emitter.js` の現状:
```javascript
  const round = Number(block.round) || 0;
  let geomXml;
  if (round > 0) {
    const adj = Math.min(round * 5000, 50000);
    geomXml = `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adj}"/></a:avLst></a:prstGeom>`;
  } else {
    geomXml = `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`;
  }
```

を以下に置き換え:
```javascript
  const round = Number(block.round) || 0;
  let geomXml;
  if (round > 0) {
    // SVG `rx` (px) と一致させるため、短辺ピクセル長に対する比率として adj を算出
    const shortPx = Math.min(block.w, block.h) * gridPx;
    const adjFromPx = shortPx > 0 ? Math.round((round / shortPx) * 100000) : 0;
    const adj = Math.min(Math.max(adjFromPx, 0), 50000);
    geomXml = `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adj}"/></a:avLst></a:prstGeom>`;
  } else {
    geomXml = `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`;
  }
```

- [ ] **Step 4: テスト実行（PASS を確認）**

```bash
npm test 2>&1 | tail -10
```

期待: `# pass 46, fail 0`（既存 44 - 1 件置換 + 新規 3 = 46）

- [ ] **Step 5: コミット**

```bash
git add core/excel/emitter.js core/excel/__tests__/shape-builder.test.mjs
git commit -m "fix(excel): compute roundRect adj from short-side pixel ratio (SVG-aligned)"
```

---

### Task 1.6: `buildGroupShape` に同等修正を適用（フォント + 改行）

**Files:**
- Modify: `core/excel/emitter.js:118` (paragraphs)
- Modify: `core/excel/__tests__/shape-builder.test.mjs` (新規テスト追加)

- [ ] **Step 1: テストを追加**

`core/excel/__tests__/shape-builder.test.mjs` の末尾に追加:

```javascript
test('buildGroupShape: rPr includes font specs', () => {
  const group = {
    id: 'g', label: 'G',
    x: 0, y: 0, w: 10, h: 5,
    color: '#EEEEEE', borderColor: '#999999'
  };
  const xml = buildGroupShape(group, 1, 20);
  assert.ok(xml.includes('<a:latin typeface="Calibri"/>'));
  assert.ok(xml.includes('<a:ea typeface="Yu Gothic UI"/>'));
});

test('buildGroupShape: DSL 2-char \\n in label splits into multiple <a:p>', () => {
  const group = {
    id: 'g', label: 'Line1\\nLine2',
    x: 0, y: 0, w: 10, h: 5,
    color: '#EEEEEE', borderColor: '#999999'
  };
  const xml = buildGroupShape(group, 1, 20);
  const pCount = (xml.match(/<a:p>/g) || []).length;
  assert.equal(pCount, 2);
});
```

- [ ] **Step 2: テスト実行 (FAIL を確認)**

```bash
npm test 2>&1 | grep -B1 -A2 "buildGroupShape: rPr\|DSL 2-char"
```

期待: 両方 FAIL。

- [ ] **Step 3: `buildGroupShape` を修正**

`buildBlockShape` と同じパターン（paragraphs 変数を関数本体で計算してから template 内で参照）に揃える。

`core/excel/emitter.js` の `buildGroupShape` 関数全体を以下に置き換え:

```javascript
export function buildGroupShape(group, shapeId, gridPx) {
  const x = gridToEmu(group.x, gridPx);
  const y = gridToEmu(group.y, gridPx);
  const cx = gridToEmu(group.w, gridPx);
  const cy = gridToEmu(group.h, gridPx);
  const fillColor = normalizeColor(group.color, 'F3F4F6');
  const borderColor = normalizeColor(group.borderColor, '9CA3AF');

  const labelLines = String(group.label || '').split(/\\n|\r?\n/);
  const paragraphs = labelLines.map(line =>
    `<a:p><a:pPr algn="l"/><a:r><a:rPr lang="ja-JP" sz="900" b="1"><a:solidFill><a:srgbClr val="475569"/></a:solidFill><a:latin typeface="Calibri"/><a:ea typeface="Yu Gothic UI"/></a:rPr><a:t>${escapeXml(line)}</a:t></a:r></a:p>`
  ).join('');

  return `<xdr:absoluteAnchor>` +
    `<xdr:pos x="${x}" y="${y}"/>` +
    `<xdr:ext cx="${cx}" cy="${cy}"/>` +
    `<xdr:sp macro="" textlink="">` +
      `<xdr:nvSpPr>` +
        `<xdr:cNvPr id="${shapeId}" name="group:${escapeXml(group.id)}"/>` +
        `<xdr:cNvSpPr/>` +
      `</xdr:nvSpPr>` +
      `<xdr:spPr>` +
        `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
        `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
        `<a:solidFill><a:srgbClr val="${fillColor}"><a:alpha val="40000"/></a:srgbClr></a:solidFill>` +
        `<a:ln><a:solidFill><a:srgbClr val="${borderColor}"/></a:solidFill></a:ln>` +
      `</xdr:spPr>` +
      `<xdr:txBody>` +
        `<a:bodyPr wrap="square" anchor="t"/>` +
        `<a:lstStyle/>` +
        paragraphs +
      `</xdr:txBody>` +
    `</xdr:sp>` +
    `<xdr:clientData/>` +
  `</xdr:absoluteAnchor>`;
}
```

- [ ] **Step 4: テスト実行（PASS を確認）**

```bash
npm test 2>&1 | tail -10
```

期待: `# pass 48, fail 0`

- [ ] **Step 5: コミット**

```bash
git add core/excel/emitter.js core/excel/__tests__/shape-builder.test.mjs
git commit -m "feat(excel): apply font specs and DSL-newline split to buildGroupShape"
```

---

### Task 1.7: `buildConnectionLabel` に同等修正を適用（フォント + 改行）

**Files:**
- Modify: `core/excel/emitter.js:203` (paragraph in connection label)
- Modify: `core/excel/__tests__/connection.test.mjs` (新規テスト追加)

- [ ] **Step 1: テストを追加**

`core/excel/__tests__/connection.test.mjs` の末尾に追加:

```javascript
test('buildConnectionLabel: includes font specs', () => {
  const xml = buildConnectionLabel(
    { from: 'a', to: 'b', label: 'request' },
    0,
    { x1: 100000, y1: 100000, x2: 500000, y2: 100000 },
    99
  );
  assert.ok(xml.includes('<a:latin typeface="Calibri"/>'));
  assert.ok(xml.includes('<a:ea typeface="Yu Gothic UI"/>'));
});

test('buildConnectionLabel: DSL 2-char \\n splits label', () => {
  const xml = buildConnectionLabel(
    { from: 'a', to: 'b', label: 'A\\nB' },
    0,
    { x1: 0, y1: 0, x2: 100000, y2: 0 },
    99
  );
  const pCount = (xml.match(/<a:p>/g) || []).length;
  assert.equal(pCount, 2);
});
```

- [ ] **Step 2: テスト実行 (FAIL を確認)**

```bash
npm test 2>&1 | grep -B1 -A2 "buildConnectionLabel: includes\|DSL 2-char \\\\n splits"
```

期待: 両方 FAIL。

- [ ] **Step 3: `buildConnectionLabel` を修正**

`core/excel/emitter.js` の `buildConnectionLabel` 関数全体を以下に置き換え（paragraphs 変数化 + フォント明示 + DSL 改行 split）:

```javascript
export function buildConnectionLabel(conn, connIndex, endpoints, shapeId) {
  const { x1, y1, x2, y2 } = endpoints;
  const midX = Math.round((x1 + x2) / 2);
  const midY = Math.round((y1 + y2) / 2);
  const tbW = 500000;
  const tbH = 200000;
  const posX = midX - tbW / 2;
  const posY = midY - tbH / 2;

  const labelLines = String(conn.label || '').split(/\\n|\r?\n/);
  const paragraphs = labelLines.map(line =>
    `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ja-JP" sz="900"><a:solidFill><a:srgbClr val="64748B"/></a:solidFill><a:latin typeface="Calibri"/><a:ea typeface="Yu Gothic UI"/></a:rPr><a:t>${escapeXml(line)}</a:t></a:r></a:p>`
  ).join('');

  return `<xdr:absoluteAnchor>` +
    `<xdr:pos x="${posX}" y="${posY}"/>` +
    `<xdr:ext cx="${tbW}" cy="${tbH}"/>` +
    `<xdr:sp macro="" textlink="">` +
      `<xdr:nvSpPr>` +
        `<xdr:cNvPr id="${shapeId}" name="connlabel:${connIndex}"/>` +
        `<xdr:cNvSpPr txBox="1"/>` +
      `</xdr:nvSpPr>` +
      `<xdr:spPr>` +
        `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${tbW}" cy="${tbH}"/></a:xfrm>` +
        `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
        `<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>` +
        `<a:ln><a:noFill/></a:ln>` +
      `</xdr:spPr>` +
      `<xdr:txBody>` +
        `<a:bodyPr wrap="square" anchor="ctr"/>` +
        `<a:lstStyle/>` +
        paragraphs +
      `</xdr:txBody>` +
    `</xdr:sp>` +
    `<xdr:clientData/>` +
  `</xdr:absoluteAnchor>`;
}
```

- [ ] **Step 4: テスト実行（PASS を確認）**

```bash
npm test 2>&1 | tail -10
```

期待: `# pass 50, fail 0`

- [ ] **Step 5: コミット**

```bash
git add core/excel/emitter.js core/excel/__tests__/connection.test.mjs
git commit -m "feat(excel): apply font specs and DSL-newline split to buildConnectionLabel"
```

---

### Task 1.8: Golden ファイル 3 つを再生成

**Files:**
- Regenerate: `core/excel/fixtures/basic.expected-drawing.xml`
- Regenerate: `core/excel/fixtures/with-group.expected-drawing.xml`
- Regenerate: `core/excel/fixtures/with-note.expected-drawing.xml`

- [ ] **Step 1: 既存 golden テストが現在 FAIL することを確認**

```bash
npm test 2>&1 | grep -E "golden:|fail [^0]"
```

期待: golden file 3 件すべて FAIL（フォント・autoFit・adj の変更により出力 XML が変わったため）。

- [ ] **Step 2: 一時ジェネレータスクリプトを作る**

`core/excel/_gen-fixtures.mjs` を作成:

```javascript
// One-off regeneration script (DO NOT COMMIT)
import { writeFileSync } from 'node:fs';
import { buildDrawingXml } from './emitter.js';

const fixtures = {
  basic: {
    canvas: { width: 400, height: 200, grid: 20 },
    blocks: [
      { id: 'ui', label: 'UI', x: 1, y: 1, w: 5, h: 3, color: '#3B82F6', textColor: '#FFFFFF', borderColor: null, round: 4, style: 'solid' },
      { id: 'core', label: 'Core', x: 10, y: 1, w: 5, h: 3, color: '#10B981', textColor: '#FFFFFF', borderColor: null, round: 4, style: 'solid' }
    ],
    groups: [], notes: [],
    connections: [
      { from: 'ui', to: 'core', label: 'request', color: '#64748B', style: 'solid', width: 1.5, bidir: false }
    ],
    blockMap: {
      ui: { x: 1, y: 1, w: 5, h: 3 },
      core: { x: 10, y: 1, w: 5, h: 3 }
    }
  },
  'with-group': {
    canvas: { width: 400, height: 300, grid: 20 },
    blocks: [
      { id: 'ui', label: 'UI', x: 2, y: 3, w: 5, h: 3, color: '#3B82F6', textColor: '#FFFFFF', borderColor: null, round: 4, style: 'solid' },
      { id: 'core', label: 'Core', x: 10, y: 3, w: 5, h: 3, color: '#10B981', textColor: '#FFFFFF', borderColor: null, round: 4, style: 'solid' }
    ],
    groups: [
      { id: 'app', label: 'Application', x: 1, y: 1, w: 18, h: 8, color: '#EEF2FF', borderColor: '#818CF8' }
    ],
    notes: [],
    connections: [
      { from: 'ui', to: 'core', label: '', color: '#64748B', style: 'solid', width: 1.5, bidir: false }
    ],
    blockMap: {
      ui: { x: 2, y: 3, w: 5, h: 3 },
      core: { x: 10, y: 3, w: 5, h: 3 }
    }
  },
  'with-note': {
    canvas: { width: 400, height: 300, grid: 20 },
    blocks: [
      { id: 'ui', label: 'UI', x: 1, y: 3, w: 5, h: 3, color: '#3B82F6', textColor: '#FFFFFF', borderColor: null, round: 4, style: 'solid' },
      { id: 'core', label: 'Core', x: 10, y: 3, w: 5, h: 3, color: '#10B981', textColor: '#FFFFFF', borderColor: null, round: 4, style: 'solid' }
    ],
    groups: [],
    notes: [
      { id: 'memo', label: '重要', x: 1, y: 1, w: 8, h: 1, color: '#FEF3C7', textColor: '#92400E', borderColor: null, round: 4, style: 'solid' }
    ],
    connections: [
      { from: 'ui', to: 'core', label: '', color: '#64748B', style: 'solid', width: 1.5, bidir: false }
    ],
    blockMap: {
      ui: { x: 1, y: 3, w: 5, h: 3 },
      core: { x: 10, y: 3, w: 5, h: 3 }
    }
  }
};

for (const [name, ast] of Object.entries(fixtures)) {
  const xml = buildDrawingXml(ast);
  const path = `core/excel/fixtures/${name}.expected-drawing.xml`;
  writeFileSync(path, xml);
  console.log(`Regenerated: ${path} (${xml.length} bytes)`);
}
```

- [ ] **Step 3: スクリプトを実行**

```bash
node core/excel/_gen-fixtures.mjs
```

期待出力:
```
Regenerated: core/excel/fixtures/basic.expected-drawing.xml (XXXX bytes)
Regenerated: core/excel/fixtures/with-group.expected-drawing.xml (XXXX bytes)
Regenerated: core/excel/fixtures/with-note.expected-drawing.xml (XXXX bytes)
```

- [ ] **Step 4: 一時スクリプトを削除**

```bash
rm core/excel/_gen-fixtures.mjs
```

- [ ] **Step 5: テスト実行（全 PASS を確認）**

```bash
npm test 2>&1 | tail -10
```

期待: `# pass 50, fail 0`

- [ ] **Step 6: 生成された golden に新仕様の要素が入っていることを確認**

```bash
grep -l "normAutofit" core/excel/fixtures/*.xml
grep -l "Yu Gothic UI" core/excel/fixtures/*.xml
grep -l "Calibri" core/excel/fixtures/*.xml
```

期待: 3 ファイルすべてに含まれている。

- [ ] **Step 7: コミット**

```bash
git add core/excel/fixtures/
git commit -m "test(excel): regenerate golden fixtures with new font/autoFit/adj rules"
```

---

### Task 1.9: Phase 1 全体テスト確認

**Files:** なし（確認のみ）

- [ ] **Step 1: 全テスト実行**

```bash
npm test 2>&1 | tail -15
```

期待: `# tests 50` (またはそれ以上), `# pass 50`, `# fail 0`

- [ ] **Step 2: emitter.js を再読、新仕様の要素がすべて入っていることを目視確認**

確認項目:
- L64 (or 周辺): `.split(/\\n|\r?\n/)` が使われている
- `<a:normAutofit/>` が `<a:bodyPr>` 内に含まれている (buildBlockShape のみ)
- `<a:latin typeface="Calibri"/>` と `<a:ea typeface="Yu Gothic UI"/>` が `<a:rPr>` に含まれている（3 関数すべて）
- `buildBlockShape` の adj 計算が `shortPx` ベース

- [ ] **Step 3: 受け入れチェック用のコミット履歴サマリ**

```bash
git log --oneline bcbabeb..HEAD
```

期待: 8 件程度のコミット（Task 1.1〜1.8）。

---

## Phase 2: HTML スタンドアロン化

### Task 2.1: `build-browser.mjs` の実装

**Files:**
- Create: `core/excel/build-browser.mjs`

- [ ] **Step 1: ビルドスクリプトを作成**

`core/excel/build-browser.mjs` を新規作成:

```javascript
// Build derivatives for browser file:// usage:
// - template-inline.js: window.StableBlockTemplateFiles = { ... }
// - emitter.browser.js: emitter.js with `export` stripped + window.StableBlockExcel = { ... }
//
// Usage:
//   node core/excel/build-browser.mjs
//   npm run build:browser

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SKELETON_DIR = join(__dirname, 'template-skeleton');
const EMITTER_SRC = join(__dirname, 'emitter.js');
const OUT_TEMPLATE = join(__dirname, 'template-inline.js');
const OUT_EMITTER_BROWSER = join(__dirname, 'emitter.browser.js');

/**
 * Walk a directory recursively and return all files as { relativePath, content }.
 * relativePath uses forward slashes regardless of OS.
 */
function walkDir(rootDir) {
  const out = [];
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) {
        walk(full);
      } else {
        const rel = relative(rootDir, full).split(sep).join('/');
        out.push({ relativePath: rel, content: readFileSync(full, 'utf8') });
      }
    }
  }
  walk(rootDir);
  out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return out;
}

/**
 * Build the content of template-inline.js.
 */
export function buildTemplateInline(skeletonFiles) {
  const obj = {};
  for (const f of skeletonFiles) {
    obj[f.relativePath] = f.content;
  }
  return '// Auto-generated by core/excel/build-browser.mjs from template-skeleton/.\n' +
         '// DO NOT EDIT MANUALLY. Run `npm run build:browser` to regenerate.\n' +
         'window.StableBlockTemplateFiles = ' + JSON.stringify(obj, null, 2) + ';\n';
}

/**
 * Build the content of emitter.browser.js from emitter.js source.
 */
export function buildEmitterBrowser(emitterSource) {
  // Find all exported function names
  const exportNames = [];
  const exportRegex = /^\s*export\s+(?:async\s+)?function\s+(\w+)/gm;
  let match;
  while ((match = exportRegex.exec(emitterSource)) !== null) {
    exportNames.push(match[1]);
  }
  if (exportNames.length === 0) {
    throw new Error('build-browser: no exported functions found in emitter.js');
  }
  // Strip `export` keyword
  const stripped = emitterSource.replace(/^(\s*)export\s+(async\s+)?function\s+(\w+)/gm, '$1$2function $3');
  const trailer = '\n;window.StableBlockExcel = { ' + exportNames.join(', ') + ' };\n';
  return '// Auto-generated by core/excel/build-browser.mjs from emitter.js.\n' +
         '// DO NOT EDIT MANUALLY. Run `npm run build:browser` to regenerate.\n' +
         stripped + trailer;
}

/**
 * CLI entry point.
 */
function main() {
  const skeletonFiles = walkDir(SKELETON_DIR);
  const emitterSource = readFileSync(EMITTER_SRC, 'utf8');
  writeFileSync(OUT_TEMPLATE, buildTemplateInline(skeletonFiles));
  writeFileSync(OUT_EMITTER_BROWSER, buildEmitterBrowser(emitterSource));
  console.log(`Wrote: ${OUT_TEMPLATE}`);
  console.log(`Wrote: ${OUT_EMITTER_BROWSER}`);
}

// Only run main when invoked as a CLI script
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1].endsWith('build-browser.mjs')) {
  main();
}
```

- [ ] **Step 2: `package.json` に script を追加**

`package.json` を読み、`"scripts"` セクションを以下のように更新（既存の `test`, `test:watch` を残しつつ追加）:

```json
"scripts": {
  "test": "node --test \"core/excel/__tests__/*.test.mjs\"",
  "test:watch": "node --test --watch \"core/excel/__tests__/*.test.mjs\"",
  "build:browser": "node core/excel/build-browser.mjs"
}
```

- [ ] **Step 3: コミット**

```bash
git add core/excel/build-browser.mjs package.json
git commit -m "feat(excel): add build-browser.mjs to generate template-inline.js and emitter.browser.js"
```

---

### Task 2.2: ビルド実行と生成ファイルのコミット

**Files:**
- Create: `core/excel/template-inline.js` (自動生成)
- Create: `core/excel/emitter.browser.js` (自動生成)

- [ ] **Step 1: ビルドを実行**

```bash
npm run build:browser
```

期待出力:
```
Wrote: E:/00_Git/01_StatbleBlock/core/excel/template-inline.js
Wrote: E:/00_Git/01_StatbleBlock/core/excel/emitter.browser.js
```

- [ ] **Step 2: 生成内容を目視確認**

```bash
head -5 core/excel/template-inline.js
echo "---"
head -3 core/excel/emitter.browser.js
echo "---"
tail -3 core/excel/emitter.browser.js
echo "---"
grep -c "^export " core/excel/emitter.browser.js
```

期待:
- template-inline.js は `window.StableBlockTemplateFiles = {` で始まる JSON 形式
- emitter.browser.js は `// Auto-generated` で始まり、末尾に `window.StableBlockExcel = { pxToEmu, gridToEmu, ... };` が含まれる
- `^export ` の行数が **0** （全部除去された）

- [ ] **Step 3: 生成された emitter.browser.js を Node で読み込んで構文エラーがないことを確認**

```bash
node -e "const s = require('fs').readFileSync('core/excel/emitter.browser.js', 'utf8'); try { new Function(s); console.log('OK: syntactically valid'); } catch(e) { console.error('SYNTAX ERROR:', e.message); process.exit(1); }"
```

期待: `OK: syntactically valid`

- [ ] **Step 4: コミット**

```bash
git add core/excel/template-inline.js core/excel/emitter.browser.js
git commit -m "build(excel): commit generated template-inline.js and emitter.browser.js"
```

---

### Task 2.3: Drift 検出テスト

**Files:**
- Create: `core/excel/__tests__/build-browser.test.mjs`

- [ ] **Step 1: テストを作成**

`core/excel/__tests__/build-browser.test.mjs` を新規作成:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { buildTemplateInline, buildEmitterBrowser } from '../build-browser.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function walkDir(rootDir) {
  const out = [];
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) walk(full);
      else out.push({
        relativePath: relative(rootDir, full).split(sep).join('/'),
        content: readFileSync(full, 'utf8')
      });
    }
  }
  walk(rootDir);
  out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return out;
}

test('template-inline.js is up to date with template-skeleton/', () => {
  const skeleton = walkDir(join(ROOT, 'template-skeleton'));
  const expected = buildTemplateInline(skeleton);
  const actual = readFileSync(join(ROOT, 'template-inline.js'), 'utf8');
  assert.equal(actual, expected,
    'template-inline.js is stale; run `npm run build:browser` and commit the result.');
});

test('emitter.browser.js is up to date with emitter.js', () => {
  const emitterSource = readFileSync(join(ROOT, 'emitter.js'), 'utf8');
  const expected = buildEmitterBrowser(emitterSource);
  const actual = readFileSync(join(ROOT, 'emitter.browser.js'), 'utf8');
  assert.equal(actual, expected,
    'emitter.browser.js is stale; run `npm run build:browser` and commit the result.');
});

test('emitter.browser.js has no remaining `export` keyword', () => {
  const src = readFileSync(join(ROOT, 'emitter.browser.js'), 'utf8');
  const lines = src.split('\n').filter(l => /^\s*export\s+/.test(l));
  assert.equal(lines.length, 0, 'export keyword found in generated file: ' + lines.join('\n'));
});

test('emitter.browser.js sets window.StableBlockExcel with all expected functions', () => {
  const src = readFileSync(join(ROOT, 'emitter.browser.js'), 'utf8');
  const required = [
    'pxToEmu', 'gridToEmu', 'escapeXml', 'normalizeColor',
    'buildBlockShape', 'buildGroupShape', 'buildNoteShape',
    'centerOfShape', 'computeConnectionEndpoints',
    'buildConnectionShape', 'buildConnectionLabel',
    'sortByZOrder', 'buildDrawingXml',
    'packageXlsx', 'renderXlsx'
  ];
  const m = src.match(/window\.StableBlockExcel\s*=\s*\{([^}]+)\}/);
  assert.ok(m, 'window.StableBlockExcel assignment not found');
  const namesInExport = m[1].split(',').map(s => s.trim()).filter(Boolean);
  for (const name of required) {
    assert.ok(namesInExport.includes(name), `missing in export object: ${name}`);
  }
});
```

- [ ] **Step 2: テスト実行（全 PASS を確認）**

```bash
npm test 2>&1 | tail -10
```

期待: `# pass 54, fail 0`（既存 50 + 新規 4）

- [ ] **Step 3: Drift 検出が機能することを手動確認**

emitter.js に1文字追加して drift を起こす:

```bash
echo "// trailing comment" >> core/excel/emitter.js
npm test 2>&1 | grep -E "stale|fail"
```

期待: `emitter.browser.js is stale; run \`npm run build:browser\` ...` メッセージで FAIL。

元に戻す:
```bash
git checkout core/excel/emitter.js
npm test 2>&1 | tail -5
```

期待: 全 PASS に戻る。

- [ ] **Step 4: コミット**

```bash
git add core/excel/__tests__/build-browser.test.mjs
git commit -m "test(excel): add drift detection for build-browser generated files"
```

---

### Task 2.4: `stableblock.html` を file:// 互換に書き換え

**Files:**
- Modify: `stableblock.html:105-127`

- [ ] **Step 1: 現状の Excel 初期化ブロックを確認**

`stableblock.html` の L105-127 にある `<script src="core/excel/jszip.min.js">` から `</script>` までを読む。

- [ ] **Step 2: 該当ブロックを `<script src>` 3つに置き換え**

L105-127 を以下に置き換え:

```html
<!-- Excel エクスポート: file:// 互換のため <script src> でロード（ES module/fetch は file:// で使えない） -->
<script src="core/excel/jszip.min.js"></script>
<script src="core/excel/template-inline.js"></script>
<script src="core/excel/emitter.browser.js"></script>
<script>
  // 後方互換: 旧コードが window.StableBlockExcelReady を見ているため設定
  window.StableBlockExcelReady = true;
</script>
```

- [ ] **Step 3: `exportXlsx()` 関数が引き続き動作することを確認**

`stableblock.html` 内で `exportXlsx` 関数定義を grep:

```bash
grep -n "function exportXlsx" stableblock.html
```

期待: 関数定義が L799 付近に残っている。

- [ ] **Step 4: ブラウザで file:// 動作確認**

PowerShell:
```powershell
Start-Process "E:\00_Git\01_StatbleBlock\stableblock.html"
```

ブラウザの DevTools (F12) を開いてコンソールにエラーが出ていないことを確認。

`window.StableBlockExcel` / `window.JSZip` / `window.StableBlockTemplateFiles` が値を持っていることを確認:

DevTools コンソールで:
```javascript
typeof window.StableBlockExcel
typeof window.JSZip
Object.keys(window.StableBlockTemplateFiles)
```

期待:
- `'object'`
- `'function'`
- 7 entries: `['[Content_Types].xml', '_rels/.rels', 'xl/...']`

- [ ] **Step 5: Excel ボタンクリックで .xlsx ダウンロードできることを確認**

サンプル DSL を入力（既存サンプルでよい）→ Excel ボタン → `diagram.xlsx` がダウンロードされる。

- [ ] **Step 6: コミット**

```bash
git add stableblock.html
git commit -m "feat(excel): replace ES module + fetch with <script src> for file:// compatibility"
```

---

### Task 2.5: `start-html.bat` 削除と docs 更新

**Files:**
- Delete: `start-html.bat`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-05-21-excel-export-acceptance.md`

- [ ] **Step 1: `start-html.bat` を削除**

```bash
git rm start-html.bat
```

- [ ] **Step 2: `README.md` を更新**

`README.md` の HTML 版セクションを読み、`start-html.bat` の言及を削除して元のシンプルな説明に戻す:

旧（Phase 1 で追加されたもの）:
```markdown
### HTML版（環境構築不要）

`stableblock.html` をブラウザで開くだけ。オフラインで動作。

**Excelエクスポートを使う場合**は `file://` ではfetchがブロックされるためローカルHTTPサーバーが必要：

```bat
start-html.bat
```

`start-html.bat` はPython（無ければNode）でポート8000のサーバーを起動し、ブラウザを自動で開く。`Ctrl+C` で停止。
```

新:
```markdown
### HTML版（環境構築不要）

`stableblock.html` をブラウザで開くだけ。オフラインで動作。Excel エクスポートも含めて `file://` で完結。
```

- [ ] **Step 3: `acceptance.md` の HTML 検証手順を更新**

`docs/superpowers/specs/2026-05-21-excel-export-acceptance.md` の HTML 版セクションを読む。

「ローカルサーバー起動方法」サブセクション全体を削除し、HTML 版の手順を以下に簡素化:

旧:
```markdown
ローカルサーバー起動方法:
```bat
start-html.bat
```
（リポジトリルートで実行。Python優先、無ければ npx http-server にフォールバック。ブラウザは自動で開く。）
```

新:
```markdown
ブラウザで `stableblock.html` をダブルクリックして開くだけ。サーバー不要。
```

- [ ] **Step 4: コミット**

```bash
git add -A README.md docs/superpowers/specs/2026-05-21-excel-export-acceptance.md
git commit -m "docs: remove start-html.bat references; HTML now works in file:// directly"
```

---

### Task 2.6: Phase 2 全体動作確認（受け入れ）

**Files:** なし（確認のみ）

- [ ] **Step 1: クリーンチェックアウトで動作確認**

```bash
git status
```

期待: clean working tree（コミットされていない変更なし）

- [ ] **Step 2: 全テスト PASS 確認**

```bash
npm test 2>&1 | tail -10
```

期待: `# tests 54, pass 54, fail 0`

- [ ] **Step 3: file:// で HTML 版動作確認**

ブラウザで `E:\00_Git\01_StatbleBlock\stableblock.html` を直接開く（ダブルクリック）。

DevTools コンソールでエラーゼロを確認:
- `window.StableBlockExcel`, `window.JSZip`, `window.StableBlockTemplateFiles` がセットされている
- Excel ボタンクリック → `diagram.xlsx` ダウンロード成功
- ダウンロードした `.xlsx` を Excel 365 (or LibreOffice) で開く
- 開いて目視確認:
  - [ ] ブロックの**角の丸み**が SVG プレビューと同程度（過剰に丸くない）
  - [ ] **テキストがブロックからはみ出していない**（はみ出しても autoFit で縮小）
  - [ ] DSL の `\n` を含むラベルが**改行されている**（リテラル `\n` が見えない）
  - [ ] フォントが **Yu Gothic UI / Calibri** で表示されている

- [ ] **Step 4: VSCode 拡張も同様に動作することを確認**

```bash
cmd /c build-vscode.bat
```

VSCode で `.sb` を開いてプレビュー → Excel ボタン → 保存 → 同等の出力を目視確認。

- [ ] **Step 5: 受け入れチェックリストにチェック**

`docs/superpowers/specs/2026-05-21-excel-export-acceptance.md` を再確認し、HTML 版・VSCode 版・Excel 編集・LibreOffice・既存 xlsx 貼り付けの各項目を実機で確認した結果をチェックリストに反映。

- [ ] **Step 6: コミット**

```bash
git add docs/superpowers/specs/2026-05-21-excel-export-acceptance.md
git commit -m "test(excel): mark acceptance checklist after visual verification"
```

- [ ] **Step 7: コミット履歴最終確認**

```bash
git log --oneline bcbabeb..HEAD
```

期待: 約 15 件のコミット（Task 1.1〜2.6）

- [ ] **Step 8: PR #12 への push（ユーザー承認後）**

```bash
git push origin feat/excel-export-design
```

注: CLAUDE.md ルール「私の承認を得ずに GitHub の main ブランチにアクセスすること(Pull,Fetch 以外)」に従い、push 実行前にユーザー承認を取る。承認後に実行し、PR #12 が自動更新されたことを確認する。

---

## 後続作業（このプランの範囲外）

- VSCode 拡張を `emitter.browser.js` 直接利用にリファクタ（現状の inline 変換ロジックの重複削減）
- Python/MCP 実装 (Plan 2)
- 接続線追従 (Excel コネクター Binding)
- ECN-006 ルーティング移植
