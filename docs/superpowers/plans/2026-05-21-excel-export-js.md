# StableBlock Excel エクスポート 実装プラン (Phase 1: JS + HTML + VSCode)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** StableBlock の DSL を Excel ネイティブシェイプとして `.xlsx` に出力する JS 実装を作り、HTML スタンドアロン版と VSCode 拡張から呼べるようにする。

**Architecture:** `core/excel/` ディレクトリに純粋関数パイプライン（Layout Resolver → Shape Builder → Z-sort → Drawing XML Serializer → Xlsx Packager）を実装する。出力 XML は `core/excel/xlsx-emit-spec.md` を source-of-truth とし、Node 組み込みテストランナーで golden-file 比較する。HTML 版と VSCode webview の両方で同一の `emitter.js` を読み込む。

**Tech Stack:** Node.js (Node 20+ 組み込み `node:test`)、JSZip（zip 生成）、fast-xml-parser（テスト時の XML 正規化）、OOXML Drawing XML 仕様。

**前提:** main ブランチで作業すること（ECN-003 など他 feature 作業は別ブランチ）。Python/MCP 実装は本プラン対象外（mcp-server ブランチが main にマージされた後に Plan 2 として別途作成）。

---

## File Structure

```
01_StatbleBlock/
├── core/                                  # ← 新規ディレクトリ
│   └── excel/
│       ├── README.md                      # この機能の概要
│       ├── xlsx-emit-spec.md              # XML 出力の正典
│       ├── emitter.js                     # メインエミッタ（公開 API: renderXlsx）
│       ├── jszip.min.js                   # JSZip ベンダー版（オフライン用）
│       ├── template-skeleton/             # 最小 xlsx の zip 展開済みコンテンツ
│       │   ├── [Content_Types].xml
│       │   ├── _rels/.rels
│       │   ├── xl/workbook.xml
│       │   ├── xl/_rels/workbook.xml.rels
│       │   ├── xl/worksheets/sheet1.xml
│       │   ├── xl/worksheets/_rels/sheet1.xml.rels
│       │   ├── xl/drawings/drawing1.xml.placeholder  # 実装時に renderXlsx の出力で上書き
│       │   └── xl/drawings/_rels/drawing1.xml.rels
│       ├── fixtures/                      # テスト入力 (.sb) と期待出力 (.xlsx)
│       │   ├── basic.sb
│       │   ├── basic.expected-drawing.xml
│       │   ├── with-group.sb
│       │   ├── with-group.expected-drawing.xml
│       │   ├── with-note.sb
│       │   ├── with-note.expected-drawing.xml
│       │   ├── all-types.sb
│       │   └── all-types.expected-drawing.xml
│       └── __tests__/
│           ├── layout-resolver.test.mjs
│           ├── shape-builder.test.mjs
│           ├── zorder.test.mjs
│           ├── xml-serializer.test.mjs
│           ├── packager.test.mjs
│           └── golden.test.mjs
├── package.json                           # ← 新規（テスト用、最小限）
├── stableblock.html                       # 既存ファイル、Excel ボタン追加
└── vscode-stableblock/
    └── src/extension.js                   # 既存ファイル、exportExcel ハンドラ追加
```

**責務分担:**
- `emitter.js` の中に `LayoutResolver`, `ShapeBuilder`, `ZOrderSorter`, `XmlSerializer`, `XlsxPackager` を**内部関数として配置**し、公開 API は `renderXlsx(ast, opts)` のみ。
- `xlsx-emit-spec.md` は実装と並行して更新する正典。各タスクは spec の該当セクションへの参照と XML サンプルを含む。
- `template-skeleton/` は手動生成し、git にコミット。実行時に各ファイルを文字列としてロードする（fs / fetch / inline string）。

---

## Phase 0: インフラ整備

### Task 0.0: 設計 spec §6.4 を「中心-中心直線」方式に更新

設計 spec の §6.4「接続線」は「ECN-006 接続面選択アルゴリズムを再利用」と記載されているが、本プランでは Phase 1 を出荷可能にするため**中心-中心直線方式**を採用する（ECN-006 ロジック抽出は将来フェーズに分離）。spec とプランの整合を保つため、最初に spec を更新する。

**Files:**
- Modify: `docs/superpowers/specs/2026-05-21-excel-export-design.md`

- [ ] **Step 1: §6.4 を更新**

`docs/superpowers/specs/2026-05-21-excel-export-design.md` の §6.4 内、次の段落を置換:

旧:
```
端点座標は既存 `render` 関数のコネクション計算ロジック（ECN-006 で改善された接続面選択アルゴリズム）を再利用し、両端を EMU 絶対座標で固定する。
```

新:
```
端点座標は **Phase 1 では「ブロック中心から中心への直線」** で算出する。EMU 絶対座標で固定。

注: 既存 `render` 関数のコネクション計算ロジック（ECN-006 接続面選択アルゴリズム）の移植は Phase 2 以降の拡張とする。スコープ縮小の理由は次の通り:
- ECN-006 のロジックは `stableblock.html` 内に inline 実装されており、抽出して emitter から呼び出すためには既存コードのリファクタが必要
- 既存設計書に貼り付ける用途では、端点の見栄えは Excel 上の手動微調整で十分実用的
- Phase 1 を早期に出荷し、ユーザーフィードバックを得てから接続面選択を判断する
```

- [ ] **Step 2: §6.6 「スコープ外」の項目を1つ追加**

`docs/superpowers/specs/2026-05-21-excel-export-design.md` の §6.6 のリストに 1 行追加:

```
- ECN-006 接続面選択アルゴリズムの移植（Phase 1 は中心-中心直線で代替）
```

- [ ] **Step 3: コミット**

```sh
git add docs/superpowers/specs/2026-05-21-excel-export-design.md
git commit -m "docs(excel-spec): simplify §6.4 routing to center-to-center for Phase 1"
```

---

### Task 0.1: 動作確認用 .sb サンプル `basic.sb` を fixtures に作る

**Files:**
- Create: `core/excel/fixtures/basic.sb`

- [ ] **Step 1: ファイル作成**

```sh
mkdir -p core/excel/fixtures
```

- [ ] **Step 2: 内容を書く**

`core/excel/fixtures/basic.sb`:

```
@canvas width=400 height=200 grid=20
block ui "UI" at 1,1 size 5x3 color=#3B82F6 text=#FFFFFF round=4
block core "Core" at 10,1 size 5x3 color=#10B981 text=#FFFFFF round=4
ui -> core "request"
```

- [ ] **Step 3: コミット**

```sh
git add core/excel/fixtures/basic.sb
git commit -m "feat(excel): add basic test fixture (.sb)"
```

---

### Task 0.2: テスト用 `package.json` を作る（最小構成）

**Files:**
- Create: `package.json`
- Create: `.gitignore`（既存に追記）

- [ ] **Step 1: package.json を書く**

`package.json` (リポジトリルート):

```json
{
  "name": "stableblock",
  "version": "0.6.0",
  "private": true,
  "description": "StableBlock — text-based block diagram editor",
  "scripts": {
    "test": "node --test core/excel/__tests__/",
    "test:watch": "node --test --watch core/excel/__tests__/"
  },
  "devDependencies": {
    "jszip": "^3.10.1",
    "fast-xml-parser": "^4.5.0"
  }
}
```

- [ ] **Step 2: .gitignore を更新**

既存 `.gitignore` の内容に追記:

```
node_modules/
package-lock.json
```

- [ ] **Step 3: 依存をインストール**

```sh
npm install
```

期待: `node_modules/` が生成され、エラーなし。

- [ ] **Step 4: テストランナー動作確認**

```sh
npm test 2>&1 | head -5
```

期待: テストファイルがまだ無いので「no tests found」または exit 0。エラーなし。

- [ ] **Step 5: コミット**

```sh
git add package.json .gitignore
git commit -m "feat(excel): add minimal package.json for tests (JSZip + fast-xml-parser)"
```

---

### Task 0.3: Drawing XML 仕様書 `xlsx-emit-spec.md` の骨子を作る

**Files:**
- Create: `core/excel/xlsx-emit-spec.md`

- [ ] **Step 1: 仕様書を書く**

`core/excel/xlsx-emit-spec.md`:

```markdown
# StableBlock → Xlsx Drawing XML Emit Spec

## 目的
StableBlock の AST を、Excel 互換の OOXML Drawing XML に変換する正典。
JS 実装 (`emitter.js`) と Python 実装（Plan 2 で作成）は本仕様に従う。

## 単位系
- DSL のグリッド座標 1 = canvas.grid ピクセル（デフォルト 20px）
- 1 px = 9525 EMU
- すべての座標・サイズは EMU で出力

## XML ルート
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <!-- 子要素: <xdr:absoluteAnchor> を Z-order 順に列挙 -->
</xdr:wsDr>
```

## シェイプ ID
- 1 から開始する連番（unique）
- `name` 属性は `<type>:<dsl-id>` 形式（例: `block:ui`, `group:app`, `note:memo`, `conn:0`）

## Block

DSL: `block ui "UI" at 1,1 size 5x3 color=#3B82F6 text=#FFFFFF round=4`

Emit:
```xml
<xdr:absoluteAnchor>
  <xdr:pos x="190500" y="190500"/>           <!-- 1grid * 20px * 9525 -->
  <xdr:ext cx="952500" cy="571500"/>          <!-- 5grid * 20 * 9525, 3grid * 20 * 9525 -->
  <xdr:sp macro="" textlink="">
    <xdr:nvSpPr>
      <xdr:cNvPr id="2" name="block:ui"/>
      <xdr:cNvSpPr/>
    </xdr:nvSpPr>
    <xdr:spPr>
      <a:xfrm><a:off x="0" y="0"/><a:ext cx="952500" cy="571500"/></a:xfrm>
      <a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 15000"/></a:avLst></a:prstGeom>
      <a:solidFill><a:srgbClr val="3B82F6"/></a:solidFill>
      <a:ln><a:noFill/></a:ln>
    </xdr:spPr>
    <xdr:txBody>
      <a:bodyPr wrap="square" anchor="ctr"/>
      <a:lstStyle/>
      <a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ja-JP" sz="1100"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>UI</a:t></a:r></a:p>
    </xdr:txBody>
  </xdr:sp>
  <xdr:clientData/>
</xdr:absoluteAnchor>
```

ルール:
- `round=N` → `<a:gd name="adj" fmla="val M"/>`, M = round * 5000 を上限 50000
- `border=#XXX` がある → `<a:ln><a:solidFill><a:srgbClr val="XXX"/></a:solidFill></a:ln>`
- `\n` 改行 → 複数の `<a:p>` に分割
- フォントサイズは固定 1100 (= 11pt * 100)

## Group

DSL: `group app "Application" at 1,1 size 20x10 color=#EEF2FF border=#818CF8`

Emit:
```xml
<xdr:absoluteAnchor>
  <xdr:pos x="190500" y="190500"/>
  <xdr:ext cx="3810000" cy="1905000"/>
  <xdr:sp macro="" textlink="">
    <xdr:nvSpPr>
      <xdr:cNvPr id="1" name="group:app"/>
      <xdr:cNvSpPr/>
    </xdr:nvSpPr>
    <xdr:spPr>
      <a:xfrm><a:off x="0" y="0"/><a:ext cx="3810000" cy="1905000"/></a:xfrm>
      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      <a:solidFill><a:srgbClr val="EEF2FF"><a:alpha val="40000"/></a:srgbClr></a:solidFill>
      <a:ln><a:solidFill><a:srgbClr val="818CF8"/></a:solidFill></a:ln>
    </xdr:spPr>
    <xdr:txBody>
      <a:bodyPr wrap="square" anchor="t"/>
      <a:lstStyle/>
      <a:p><a:pPr algn="l"/><a:r><a:rPr lang="ja-JP" sz="900" b="1"><a:solidFill><a:srgbClr val="475569"/></a:solidFill></a:rPr><a:t>Application</a:t></a:r></a:p>
    </xdr:txBody>
  </xdr:sp>
  <xdr:clientData/>
</xdr:absoluteAnchor>
```

ルール:
- 塗りつぶしは alpha=40000 (40% = 透過度 60%)
- ラベルは左上揃え (`anchor="t"`, `algn="l"`)、太字 (`b="1"`)、9pt、テキスト色 `#475569` 固定

## Note

Block と同じ構造。ただし `name` プレフィックスは `note:` で、Z-order は最上層。

## Connection

DSL: `ui -> core "request"`

接続線本体（端点の EMU 座標を `(x1,y1)`, `(x2,y2)` とする）:
```xml
<xdr:absoluteAnchor>
  <xdr:pos x="MIN_X" y="MIN_Y"/>
  <xdr:ext cx="ABS_DX" cy="ABS_DY"/>
  <xdr:cxnSp macro="">
    <xdr:nvCxnSpPr>
      <xdr:cNvPr id="N" name="conn:I"/>
      <xdr:cNvCxnSpPr/>
    </xdr:nvCxnSpPr>
    <xdr:spPr>
      <a:xfrm flipH="FLIPH" flipV="FLIPV"><a:off x="0" y="0"/><a:ext cx="ABS_DX" cy="ABS_DY"/></a:xfrm>
      <a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom>
      <a:ln w="LW"><a:solidFill><a:srgbClr val="64748B"/></a:solidFill><a:tailEnd type="triangle"/></a:ln>
    </xdr:spPr>
  </xdr:cxnSp>
  <xdr:clientData/>
</xdr:absoluteAnchor>
```

`MIN_X = min(x1,x2)`, `MIN_Y = min(y1,y2)`, `ABS_DX = |x2-x1|`, `ABS_DY = |y2-y1|`,
`FLIPH = (x1 > x2) ? "true" : "false"`,
`FLIPV = (y1 > y2) ? "true" : "false"`,
`LW = width * 9525` (EMU)。

ルール:
- `-->` (bidir) → `<a:headEnd type="triangle"/>` も追加
- `style=dashed` → `<a:ln>` 内に `<a:prstDash val="dash"/>` を追加
- `color=#XXX` → `<a:srgbClr val="XXX"/>` を上書き
- ラベル付き → 別 anchor で TextBox を線の中点に配置（後述）

## Connection ラベル TextBox

線にラベルが付いている場合、独立シェイプとして中点に配置。
```xml
<xdr:absoluteAnchor>
  <xdr:pos x="MID_X" y="MID_Y"/>
  <xdr:ext cx="500000" cy="200000"/>
  <xdr:sp macro="" textlink="">
    <xdr:nvSpPr>
      <xdr:cNvPr id="N" name="connlabel:I"/>
      <xdr:cNvSpPr txBox="1"/>
    </xdr:nvSpPr>
    <xdr:spPr>
      <a:xfrm><a:off x="0" y="0"/><a:ext cx="500000" cy="200000"/></a:xfrm>
      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
      <a:ln><a:noFill/></a:ln>
    </xdr:spPr>
    <xdr:txBody>
      <a:bodyPr wrap="square" anchor="ctr"/>
      <a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ja-JP" sz="900"><a:solidFill><a:srgbClr val="64748B"/></a:solidFill></a:rPr><a:t>LABEL</a:t></a:r></a:p>
    </xdr:txBody>
  </xdr:sp>
  <xdr:clientData/>
</xdr:absoluteAnchor>
```

## 端点ルーティング

簡略化のため、本 Phase 1 では「ブロック中心から中心への直線」を採用する。
高精度な接続面選択（既存 render の `ECN-006` ロジック移植）は次バージョンの拡張とする。

中心座標:
- `cx = (block.x + block.w/2) * grid * 9525`
- `cy = (block.y + block.h/2) * grid * 9525`

## XML エスケープ
すべてのテキスト値（label, id）は `&` `<` `>` `"` `'` をエスケープする:
- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`
- `'` → `&apos;`

## Z-order
1. Groups (DSL 出現順)
2. Connections (DSL 出現順)
3. Connection labels (DSL 出現順)
4. Blocks (DSL 出現順)
5. Notes (DSL 出現順)

## ID 採番
`cNvPr id` は 1 から始まる連番。Z-order 順で振る。
```

- [ ] **Step 2: コミット**

```sh
git add core/excel/xlsx-emit-spec.md
git commit -m "feat(excel): add Drawing XML emit spec (source of truth)"
```

---

### Task 0.4: 最小テンプレート xlsx を手動作成して `template-skeleton/` に展開

**Files:**
- Create: `core/excel/template-skeleton/[Content_Types].xml`
- Create: `core/excel/template-skeleton/_rels/.rels`
- Create: `core/excel/template-skeleton/xl/workbook.xml`
- Create: `core/excel/template-skeleton/xl/_rels/workbook.xml.rels`
- Create: `core/excel/template-skeleton/xl/worksheets/sheet1.xml`
- Create: `core/excel/template-skeleton/xl/worksheets/_rels/sheet1.xml.rels`
- Create: `core/excel/template-skeleton/xl/drawings/_rels/drawing1.xml.rels`

- [ ] **Step 1: `[Content_Types].xml`**

`core/excel/template-skeleton/[Content_Types].xml`:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
</Types>
```

- [ ] **Step 2: `_rels/.rels`**

`core/excel/template-skeleton/_rels/.rels`:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
```

- [ ] **Step 3: `xl/workbook.xml`**

`core/excel/template-skeleton/xl/workbook.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="StableBlock" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>
```

- [ ] **Step 4: `xl/_rels/workbook.xml.rels`**

`core/excel/template-skeleton/xl/_rels/workbook.xml.rels`:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>
```

- [ ] **Step 5: `xl/worksheets/sheet1.xml`**

`core/excel/template-skeleton/xl/worksheets/sheet1.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>
  <sheetData/>
  <drawing r:id="rId1"/>
</worksheet>
```

- [ ] **Step 6: `xl/worksheets/_rels/sheet1.xml.rels`**

`core/excel/template-skeleton/xl/worksheets/_rels/sheet1.xml.rels`:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>
```

- [ ] **Step 7: `xl/drawings/_rels/drawing1.xml.rels`**

`core/excel/template-skeleton/xl/drawings/_rels/drawing1.xml.rels`:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>
```

- [ ] **Step 8: コミット**

```sh
git add core/excel/template-skeleton/
git commit -m "feat(excel): add minimal xlsx template skeleton"
```

---

### Task 0.5: JSZip ベンダー版を `core/excel/jszip.min.js` に配置

**Files:**
- Create: `core/excel/jszip.min.js`

- [ ] **Step 1: JSZip 公式 minified を取得**

```sh
curl -L -o core/excel/jszip.min.js "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"
```

期待: 約 95KB のファイルが取得できる。

- [ ] **Step 2: 動作確認（Node から読めるか）**

```sh
node -e "const s = require('fs').readFileSync('core/excel/jszip.min.js','utf8'); console.log('JSZip:', s.includes('JSZip') ? 'ok' : 'NG', 'size:', s.length);"
```

期待: `JSZip: ok size: 95XXX` (5桁の数字)

- [ ] **Step 3: コミット**

```sh
git add core/excel/jszip.min.js
git commit -m "feat(excel): vendor JSZip 3.10.1 (for HTML standalone offline use)"
```

---

## Phase 1: コアエミッタ (TDD)

### Task 1.1: EMU 変換ユーティリティ

**Files:**
- Create: `core/excel/emitter.js`
- Test: `core/excel/__tests__/layout-resolver.test.mjs`

- [ ] **Step 1: テストを書く（失敗）**

`core/excel/__tests__/layout-resolver.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pxToEmu, gridToEmu } from '../emitter.js';

test('pxToEmu: 1 px = 9525 EMU', () => {
  assert.equal(pxToEmu(1), 9525);
});

test('pxToEmu: handles zero and negative', () => {
  assert.equal(pxToEmu(0), 0);
  assert.equal(pxToEmu(-1), -9525);
});

test('pxToEmu: rounds fractional pixels', () => {
  assert.equal(pxToEmu(0.5), 4762);
});

test('gridToEmu: 1 grid at grid=20 = 20 px = 190500 EMU', () => {
  assert.equal(gridToEmu(1, 20), 190500);
});

test('gridToEmu: 5 grids at grid=20 = 100 px = 952500 EMU', () => {
  assert.equal(gridToEmu(5, 20), 952500);
});
```

- [ ] **Step 2: テストを実行（FAILを確認）**

```sh
npm test
```

期待: `Cannot find module '../emitter.js'` または import エラー。

- [ ] **Step 3: 最小実装**

`core/excel/emitter.js`:

```javascript
// StableBlock → Xlsx Drawing XML Emitter
// 仕様: core/excel/xlsx-emit-spec.md

export function pxToEmu(px) {
  return Math.round(px * 9525);
}

export function gridToEmu(grid, gridPx) {
  return pxToEmu(grid * gridPx);
}
```

- [ ] **Step 4: テストを実行（PASSを確認）**

```sh
npm test
```

期待: `tests 5, pass 5, fail 0`

- [ ] **Step 5: コミット**

```sh
git add core/excel/emitter.js core/excel/__tests__/layout-resolver.test.mjs
git commit -m "feat(excel): add EMU conversion utilities (pxToEmu, gridToEmu)"
```

---

### Task 1.2: XML エスケープと色変換ヘルパー

**Files:**
- Modify: `core/excel/emitter.js`
- Test: `core/excel/__tests__/xml-helpers.test.mjs`

- [ ] **Step 1: テストを書く**

`core/excel/__tests__/xml-helpers.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeXml, normalizeColor } from '../emitter.js';

test('escapeXml: basic chars', () => {
  assert.equal(escapeXml('a & b'), 'a &amp; b');
  assert.equal(escapeXml('<tag>'), '&lt;tag&gt;');
  assert.equal(escapeXml('"hi"'), '&quot;hi&quot;');
  assert.equal(escapeXml("it's"), 'it&apos;s');
});

test('escapeXml: empty and null-safe', () => {
  assert.equal(escapeXml(''), '');
  assert.equal(escapeXml(null), '');
  assert.equal(escapeXml(undefined), '');
});

test('normalizeColor: strips # and uppercases', () => {
  assert.equal(normalizeColor('#3b82f6'), '3B82F6');
  assert.equal(normalizeColor('3B82F6'), '3B82F6');
});

test('normalizeColor: falls back to default for invalid', () => {
  assert.equal(normalizeColor(null, '000000'), '000000');
  assert.equal(normalizeColor('', '000000'), '000000');
  assert.equal(normalizeColor('not-a-color', '000000'), '000000');
});
```

- [ ] **Step 2: テストを実行（FAIL）**

```sh
npm test 2>&1 | grep -E "pass|fail"
```

期待: 4 件 FAIL (関数未定義)

- [ ] **Step 3: 実装を `emitter.js` に追加**

`core/excel/emitter.js` の末尾に追加:

```javascript
export function escapeXml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function normalizeColor(value, fallback = '000000') {
  if (!value || typeof value !== 'string') return fallback;
  const cleaned = value.replace(/^#/, '').toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(cleaned)) return fallback;
  return cleaned;
}
```

- [ ] **Step 4: テスト実行（PASS）**

```sh
npm test
```

期待: 全テスト PASS。

- [ ] **Step 5: コミット**

```sh
git add core/excel/emitter.js core/excel/__tests__/xml-helpers.test.mjs
git commit -m "feat(excel): add XML escape and color normalize helpers"
```

---

### Task 1.3: Block シェイプ XML ビルダー

**Files:**
- Modify: `core/excel/emitter.js`
- Test: `core/excel/__tests__/shape-builder.test.mjs`

- [ ] **Step 1: テストを書く**

`core/excel/__tests__/shape-builder.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { XMLParser } from 'fast-xml-parser';
import { buildBlockShape } from '../emitter.js';

const parser = new XMLParser({ ignoreAttributes: false });

test('buildBlockShape: minimal block', () => {
  const block = {
    id: 'ui', label: 'UI',
    x: 1, y: 1, w: 5, h: 3,
    color: '#3B82F6', textColor: '#FFFFFF',
    borderColor: null, round: 4, style: 'solid'
  };
  const xml = buildBlockShape(block, 2, 20);
  const parsed = parser.parse(xml);
  const anchor = parsed['xdr:absoluteAnchor'];
  assert.equal(anchor['xdr:pos']['@_x'], '190500');
  assert.equal(anchor['xdr:pos']['@_y'], '190500');
  assert.equal(anchor['xdr:ext']['@_cx'], '952500');
  assert.equal(anchor['xdr:ext']['@_cy'], '571500');
  assert.equal(anchor['xdr:sp']['xdr:nvSpPr']['xdr:cNvPr']['@_id'], '2');
  assert.equal(anchor['xdr:sp']['xdr:nvSpPr']['xdr:cNvPr']['@_name'], 'block:ui');
});

test('buildBlockShape: label is escaped', () => {
  const block = {
    id: 'a', label: 'A & B',
    x: 0, y: 0, w: 2, h: 2,
    color: '#FFFFFF', textColor: '#000000',
    borderColor: null, round: 0, style: 'solid'
  };
  const xml = buildBlockShape(block, 1, 20);
  assert.ok(xml.includes('A &amp; B'));
  assert.ok(!xml.includes('A & B'));
});

test('buildBlockShape: round=0 produces rect not roundRect', () => {
  const block = {
    id: 'a', label: 'A',
    x: 0, y: 0, w: 2, h: 2,
    color: '#FFFFFF', textColor: '#000000',
    borderColor: null, round: 0, style: 'solid'
  };
  const xml = buildBlockShape(block, 1, 20);
  assert.ok(xml.includes('prst="rect"'));
  assert.ok(!xml.includes('roundRect'));
});

test('buildBlockShape: round=8 includes adj value', () => {
  const block = {
    id: 'a', label: 'A',
    x: 0, y: 0, w: 2, h: 2,
    color: '#FFFFFF', textColor: '#000000',
    borderColor: null, round: 8, style: 'solid'
  };
  const xml = buildBlockShape(block, 1, 20);
  assert.ok(xml.includes('roundRect'));
  assert.ok(xml.includes('val 40000'));  // 8 * 5000
});

test('buildBlockShape: border color produces line solidFill', () => {
  const block = {
    id: 'a', label: 'A',
    x: 0, y: 0, w: 2, h: 2,
    color: '#FFFFFF', textColor: '#000000',
    borderColor: '#FF0000', round: 0, style: 'solid'
  };
  const xml = buildBlockShape(block, 1, 20);
  assert.ok(xml.match(/<a:ln>\s*<a:solidFill><a:srgbClr val="FF0000"\/><\/a:solidFill>\s*<\/a:ln>/));
});

test('buildBlockShape: \\n in label splits into multiple <a:p>', () => {
  const block = {
    id: 'a', label: 'Line1\nLine2',
    x: 0, y: 0, w: 2, h: 2,
    color: '#FFFFFF', textColor: '#000000',
    borderColor: null, round: 0, style: 'solid'
  };
  const xml = buildBlockShape(block, 1, 20);
  const pCount = (xml.match(/<a:p>/g) || []).length;
  assert.equal(pCount, 2);
});
```

- [ ] **Step 2: テスト実行（FAIL）**

```sh
npm test 2>&1 | grep -E "(pass|fail|Error)"
```

期待: 6件 FAIL (buildBlockShape 未定義)

- [ ] **Step 3: 実装**

`core/excel/emitter.js` に追加:

```javascript
export function buildBlockShape(block, shapeId, gridPx) {
  const x = gridToEmu(block.x, gridPx);
  const y = gridToEmu(block.y, gridPx);
  const cx = gridToEmu(block.w, gridPx);
  const cy = gridToEmu(block.h, gridPx);
  const fillColor = normalizeColor(block.color, 'CCCCCC');
  const textColor = normalizeColor(block.textColor, '000000');
  const borderXml = block.borderColor
    ? `<a:ln><a:solidFill><a:srgbClr val="${normalizeColor(block.borderColor)}"/></a:solidFill></a:ln>`
    : `<a:ln><a:noFill/></a:ln>`;

  const round = Number(block.round) || 0;
  let geomXml;
  if (round > 0) {
    const adj = Math.min(round * 5000, 50000);
    geomXml = `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adj}"/></a:avLst></a:prstGeom>`;
  } else {
    geomXml = `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`;
  }

  const labelLines = String(block.label || '').split('\n');
  const paragraphs = labelLines.map(line =>
    `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ja-JP" sz="1100"><a:solidFill><a:srgbClr val="${textColor}"/></a:solidFill></a:rPr><a:t>${escapeXml(line)}</a:t></a:r></a:p>`
  ).join('');

  return `<xdr:absoluteAnchor>` +
    `<xdr:pos x="${x}" y="${y}"/>` +
    `<xdr:ext cx="${cx}" cy="${cy}"/>` +
    `<xdr:sp macro="" textlink="">` +
      `<xdr:nvSpPr>` +
        `<xdr:cNvPr id="${shapeId}" name="block:${escapeXml(block.id)}"/>` +
        `<xdr:cNvSpPr/>` +
      `</xdr:nvSpPr>` +
      `<xdr:spPr>` +
        `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
        geomXml +
        `<a:solidFill><a:srgbClr val="${fillColor}"/></a:solidFill>` +
        borderXml +
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

- [ ] **Step 4: テスト実行（PASS）**

```sh
npm test
```

期待: 全テスト PASS。

- [ ] **Step 5: コミット**

```sh
git add core/excel/emitter.js core/excel/__tests__/shape-builder.test.mjs
git commit -m "feat(excel): add buildBlockShape with round, border, multi-line label"
```

---

### Task 1.4: Group シェイプ XML ビルダー

**Files:**
- Modify: `core/excel/emitter.js`
- Modify: `core/excel/__tests__/shape-builder.test.mjs`

- [ ] **Step 1: テストを追加**

`core/excel/__tests__/shape-builder.test.mjs` の末尾に追加:

```javascript
import { buildGroupShape } from '../emitter.js';

test('buildGroupShape: basic group with label', () => {
  const group = {
    id: 'app', label: 'Application',
    x: 1, y: 1, w: 20, h: 10,
    color: '#EEF2FF', borderColor: '#818CF8'
  };
  const xml = buildGroupShape(group, 1, 20);
  assert.ok(xml.includes('group:app'));
  assert.ok(xml.includes('Application'));
  assert.ok(xml.includes('val="EEF2FF"'));
  assert.ok(xml.includes('val="818CF8"'));
  assert.ok(xml.includes('alpha val="40000"'));  // 半透明
  assert.ok(xml.includes('anchor="t"'));         // 左上ラベル
  assert.ok(xml.includes('algn="l"'));
});

test('buildGroupShape: no border falls back to gray default', () => {
  const group = {
    id: 'g', label: 'G',
    x: 0, y: 0, w: 5, h: 5,
    color: '#EEEEEE', borderColor: null
  };
  const xml = buildGroupShape(group, 1, 20);
  assert.ok(xml.includes('<a:ln>'));  // border defaults to something
});
```

- [ ] **Step 2: テスト実行（FAIL）**

期待: `buildGroupShape is not exported`

- [ ] **Step 3: 実装**

`core/excel/emitter.js` に追加:

```javascript
export function buildGroupShape(group, shapeId, gridPx) {
  const x = gridToEmu(group.x, gridPx);
  const y = gridToEmu(group.y, gridPx);
  const cx = gridToEmu(group.w, gridPx);
  const cy = gridToEmu(group.h, gridPx);
  const fillColor = normalizeColor(group.color, 'F3F4F6');
  const borderColor = normalizeColor(group.borderColor, '9CA3AF');

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
        `<a:p><a:pPr algn="l"/><a:r><a:rPr lang="ja-JP" sz="900" b="1"><a:solidFill><a:srgbClr val="475569"/></a:solidFill></a:rPr><a:t>${escapeXml(group.label || '')}</a:t></a:r></a:p>` +
      `</xdr:txBody>` +
    `</xdr:sp>` +
    `<xdr:clientData/>` +
  `</xdr:absoluteAnchor>`;
}
```

- [ ] **Step 4: テスト実行（PASS）**

```sh
npm test
```

- [ ] **Step 5: コミット**

```sh
git add core/excel/emitter.js core/excel/__tests__/shape-builder.test.mjs
git commit -m "feat(excel): add buildGroupShape with semi-transparent fill + top-left label"
```

---

### Task 1.5: Note シェイプ XML ビルダー

**Files:**
- Modify: `core/excel/emitter.js`
- Modify: `core/excel/__tests__/shape-builder.test.mjs`

- [ ] **Step 1: テストを追加**

`core/excel/__tests__/shape-builder.test.mjs` 末尾に追加:

```javascript
import { buildNoteShape } from '../emitter.js';

test('buildNoteShape: note has note: prefix in name', () => {
  const note = {
    id: 'memo', label: 'Memo',
    x: 1, y: 1, w: 5, h: 2,
    color: '#FEF3C7', textColor: '#92400E',
    borderColor: null, round: 4, style: 'solid'
  };
  const xml = buildNoteShape(note, 10, 20);
  assert.ok(xml.includes('name="note:memo"'));
  assert.ok(xml.includes('val="FEF3C7"'));
});
```

- [ ] **Step 2: テスト実行（FAIL）**

- [ ] **Step 3: 実装（Block の薄いラッパー）**

`core/excel/emitter.js` に追加:

```javascript
export function buildNoteShape(note, shapeId, gridPx) {
  // ノートは Block と同じ形だが name プレフィックスが note:
  const xml = buildBlockShape(note, shapeId, gridPx);
  return xml.replace(`name="block:${escapeXml(note.id)}"`, `name="note:${escapeXml(note.id)}"`);
}
```

- [ ] **Step 4: テスト実行（PASS）**

- [ ] **Step 5: コミット**

```sh
git add core/excel/emitter.js core/excel/__tests__/shape-builder.test.mjs
git commit -m "feat(excel): add buildNoteShape (block shape with note: prefix)"
```

---

### Task 1.6: Connection 端点計算（中心-中心ルーティング）

**Files:**
- Modify: `core/excel/emitter.js`
- Create: `core/excel/__tests__/routing.test.mjs`

- [ ] **Step 1: テストを書く**

`core/excel/__tests__/routing.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centerOfShape, computeConnectionEndpoints } from '../emitter.js';

test('centerOfShape: 1,1 size 5x3 grid=20 -> center at (3.5, 2.5) grid', () => {
  const r = centerOfShape({ x: 1, y: 1, w: 5, h: 3 }, 20);
  // 中心 px = ((1 + 5/2) * 20, (1 + 3/2) * 20) = (70, 50)
  // EMU = (70*9525, 50*9525) = (666750, 476250)
  assert.equal(r.x, 666750);
  assert.equal(r.y, 476250);
});

test('computeConnectionEndpoints: returns from-center and to-center', () => {
  const blockMap = {
    a: { x: 0, y: 0, w: 2, h: 2 },
    b: { x: 10, y: 0, w: 2, h: 2 }
  };
  const conn = { from: 'a', to: 'b' };
  const ep = computeConnectionEndpoints(conn, blockMap, 20);
  // a center px = (1*20, 1*20) = (20, 20) -> EMU (190500, 190500)
  // b center px = (11*20, 1*20) = (220, 20) -> EMU (2095500, 190500)
  assert.deepEqual(ep, { x1: 190500, y1: 190500, x2: 2095500, y2: 190500 });
});

test('computeConnectionEndpoints: returns null if endpoint missing', () => {
  const blockMap = { a: { x: 0, y: 0, w: 2, h: 2 } };
  const conn = { from: 'a', to: 'missing' };
  const ep = computeConnectionEndpoints(conn, blockMap, 20);
  assert.equal(ep, null);
});
```

- [ ] **Step 2: テスト実行（FAIL）**

- [ ] **Step 3: 実装**

`core/excel/emitter.js` に追加:

```javascript
export function centerOfShape(shape, gridPx) {
  const cxPx = (shape.x + shape.w / 2) * gridPx;
  const cyPx = (shape.y + shape.h / 2) * gridPx;
  return { x: pxToEmu(cxPx), y: pxToEmu(cyPx) };
}

export function computeConnectionEndpoints(conn, blockMap, gridPx) {
  const from = blockMap[conn.from];
  const to = blockMap[conn.to];
  if (!from || !to) return null;
  const c1 = centerOfShape(from, gridPx);
  const c2 = centerOfShape(to, gridPx);
  return { x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y };
}
```

- [ ] **Step 4: テスト実行（PASS）**

- [ ] **Step 5: コミット**

```sh
git add core/excel/emitter.js core/excel/__tests__/routing.test.mjs
git commit -m "feat(excel): add connection endpoint routing (center-to-center)"
```

---

### Task 1.7: Connection シェイプ XML ビルダー（単方向・基本）

**Files:**
- Modify: `core/excel/emitter.js`
- Create: `core/excel/__tests__/connection.test.mjs`

- [ ] **Step 1: テストを書く**

`core/excel/__tests__/connection.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConnectionShape } from '../emitter.js';

test('buildConnectionShape: single-direction arrow', () => {
  const conn = {
    from: 'a', to: 'b', label: '',
    color: '#64748B', style: 'solid', width: 1.5, bidir: false
  };
  const endpoints = { x1: 100000, y1: 100000, x2: 500000, y2: 100000 };
  const xml = buildConnectionShape(conn, 0, endpoints, 1);
  assert.ok(xml.includes('name="conn:0"'));
  assert.ok(xml.includes('straightConnector1'));
  assert.ok(xml.includes('<a:tailEnd type="triangle"/>'));
  assert.ok(!xml.includes('<a:headEnd'));
  assert.ok(xml.includes('val="64748B"'));
});

test('buildConnectionShape: bidirectional has both arrowheads', () => {
  const conn = {
    from: 'a', to: 'b', label: '',
    color: '#000000', style: 'solid', width: 1, bidir: true
  };
  const endpoints = { x1: 0, y1: 0, x2: 100000, y2: 0 };
  const xml = buildConnectionShape(conn, 0, endpoints, 1);
  assert.ok(xml.includes('<a:headEnd type="triangle"/>'));
  assert.ok(xml.includes('<a:tailEnd type="triangle"/>'));
});

test('buildConnectionShape: dashed style', () => {
  const conn = {
    from: 'a', to: 'b', label: '',
    color: '#000000', style: 'dashed', width: 1, bidir: false
  };
  const endpoints = { x1: 0, y1: 0, x2: 100000, y2: 0 };
  const xml = buildConnectionShape(conn, 0, endpoints, 1);
  assert.ok(xml.includes('<a:prstDash val="dash"/>'));
});

test('buildConnectionShape: width converts to EMU (1.5 px = 14288)', () => {
  const conn = {
    from: 'a', to: 'b', label: '',
    color: '#000000', style: 'solid', width: 1.5, bidir: false
  };
  const endpoints = { x1: 0, y1: 0, x2: 100000, y2: 0 };
  const xml = buildConnectionShape(conn, 0, endpoints, 1);
  assert.ok(xml.includes('w="14288"'));
});

test('buildConnectionShape: reversed coords use flipH', () => {
  const conn = {
    from: 'a', to: 'b', label: '',
    color: '#000000', style: 'solid', width: 1, bidir: false
  };
  // x1 > x2 → flipH=true
  const endpoints = { x1: 500000, y1: 0, x2: 100000, y2: 0 };
  const xml = buildConnectionShape(conn, 0, endpoints, 1);
  assert.ok(xml.includes('flipH="true"'));
});
```

- [ ] **Step 2: テスト実行（FAIL）**

- [ ] **Step 3: 実装**

`core/excel/emitter.js` に追加:

```javascript
export function buildConnectionShape(conn, connIndex, endpoints, shapeId) {
  const { x1, y1, x2, y2 } = endpoints;
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const absDx = Math.abs(x2 - x1);
  const absDy = Math.abs(y2 - y1);
  const flipH = x1 > x2 ? 'true' : 'false';
  const flipV = y1 > y2 ? 'true' : 'false';
  const lineColor = normalizeColor(conn.color, '64748B');
  const lineWidth = pxToEmu(Number(conn.width) || 1.5);
  const dashXml = conn.style === 'dashed' ? '<a:prstDash val="dash"/>' : '';
  const headEnd = conn.bidir ? '<a:headEnd type="triangle"/>' : '';

  return `<xdr:absoluteAnchor>` +
    `<xdr:pos x="${minX}" y="${minY}"/>` +
    `<xdr:ext cx="${absDx}" cy="${absDy}"/>` +
    `<xdr:cxnSp macro="">` +
      `<xdr:nvCxnSpPr>` +
        `<xdr:cNvPr id="${shapeId}" name="conn:${connIndex}"/>` +
        `<xdr:cNvCxnSpPr/>` +
      `</xdr:nvCxnSpPr>` +
      `<xdr:spPr>` +
        `<a:xfrm flipH="${flipH}" flipV="${flipV}"><a:off x="0" y="0"/><a:ext cx="${absDx}" cy="${absDy}"/></a:xfrm>` +
        `<a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom>` +
        `<a:ln w="${lineWidth}"><a:solidFill><a:srgbClr val="${lineColor}"/></a:solidFill>${dashXml}${headEnd}<a:tailEnd type="triangle"/></a:ln>` +
      `</xdr:spPr>` +
    `</xdr:cxnSp>` +
    `<xdr:clientData/>` +
  `</xdr:absoluteAnchor>`;
}
```

- [ ] **Step 4: テスト実行（PASS）**

- [ ] **Step 5: コミット**

```sh
git add core/excel/emitter.js core/excel/__tests__/connection.test.mjs
git commit -m "feat(excel): add buildConnectionShape (single/bidir/dashed)"
```

---

### Task 1.8: Connection ラベル TextBox ビルダー

**Files:**
- Modify: `core/excel/emitter.js`
- Modify: `core/excel/__tests__/connection.test.mjs`

- [ ] **Step 1: テストを追加**

`core/excel/__tests__/connection.test.mjs` 末尾に追加:

```javascript
import { buildConnectionLabel } from '../emitter.js';

test('buildConnectionLabel: places textbox at midpoint', () => {
  const xml = buildConnectionLabel(
    { from: 'a', to: 'b', label: 'request' },
    0,
    { x1: 100000, y1: 100000, x2: 500000, y2: 100000 },
    99
  );
  assert.ok(xml.includes('name="connlabel:0"'));
  assert.ok(xml.includes('request'));
  // midX = 300000 - 250000 (textbox half width) = 50000
  assert.ok(xml.includes('x="50000"'));
});

test('buildConnectionLabel: escapes special chars in label', () => {
  const xml = buildConnectionLabel(
    { from: 'a', to: 'b', label: '<X & Y>' },
    0,
    { x1: 0, y1: 0, x2: 100000, y2: 0 },
    99
  );
  assert.ok(xml.includes('&lt;X &amp; Y&gt;'));
  assert.ok(!xml.includes('<X & Y>'));
});
```

- [ ] **Step 2: テスト実行（FAIL）**

- [ ] **Step 3: 実装**

`core/excel/emitter.js` に追加:

```javascript
export function buildConnectionLabel(conn, connIndex, endpoints, shapeId) {
  const { x1, y1, x2, y2 } = endpoints;
  const midX = Math.round((x1 + x2) / 2);
  const midY = Math.round((y1 + y2) / 2);
  const tbW = 500000;
  const tbH = 200000;
  const posX = midX - tbW / 2;
  const posY = midY - tbH / 2;

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
        `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ja-JP" sz="900"><a:solidFill><a:srgbClr val="64748B"/></a:solidFill></a:rPr><a:t>${escapeXml(conn.label || '')}</a:t></a:r></a:p>` +
      `</xdr:txBody>` +
    `</xdr:sp>` +
    `<xdr:clientData/>` +
  `</xdr:absoluteAnchor>`;
}
```

- [ ] **Step 4: テスト実行（PASS）**

- [ ] **Step 5: コミット**

```sh
git add core/excel/emitter.js core/excel/__tests__/connection.test.mjs
git commit -m "feat(excel): add buildConnectionLabel (textbox at midpoint)"
```

---

### Task 1.9: Z-order ソート

**Files:**
- Modify: `core/excel/emitter.js`
- Create: `core/excel/__tests__/zorder.test.mjs`

- [ ] **Step 1: テストを書く**

`core/excel/__tests__/zorder.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortByZOrder } from '../emitter.js';

test('sortByZOrder: groups < connections < connection-labels < blocks < notes', () => {
  const items = [
    { kind: 'note', id: 'n1', srcIndex: 0 },
    { kind: 'block', id: 'b1', srcIndex: 0 },
    { kind: 'connection', id: 'c1', srcIndex: 0 },
    { kind: 'group', id: 'g1', srcIndex: 0 },
    { kind: 'connlabel', id: 'cl1', srcIndex: 0 },
  ];
  const sorted = sortByZOrder(items);
  assert.deepEqual(sorted.map(s => s.kind), [
    'group', 'connection', 'connlabel', 'block', 'note'
  ]);
});

test('sortByZOrder: stable on srcIndex within same kind', () => {
  const items = [
    { kind: 'block', id: 'b3', srcIndex: 2 },
    { kind: 'block', id: 'b1', srcIndex: 0 },
    { kind: 'block', id: 'b2', srcIndex: 1 },
  ];
  const sorted = sortByZOrder(items);
  assert.deepEqual(sorted.map(s => s.id), ['b1', 'b2', 'b3']);
});
```

- [ ] **Step 2: テスト実行（FAIL）**

- [ ] **Step 3: 実装**

`core/excel/emitter.js` に追加:

```javascript
const Z_ORDER = { group: 0, connection: 1, connlabel: 2, block: 3, note: 4 };

export function sortByZOrder(items) {
  return [...items].sort((a, b) => {
    const za = Z_ORDER[a.kind] ?? 99;
    const zb = Z_ORDER[b.kind] ?? 99;
    if (za !== zb) return za - zb;
    return (a.srcIndex || 0) - (b.srcIndex || 0);
  });
}
```

- [ ] **Step 4: テスト実行（PASS）**

- [ ] **Step 5: コミット**

```sh
git add core/excel/emitter.js core/excel/__tests__/zorder.test.mjs
git commit -m "feat(excel): add z-order sorter (group < conn < label < block < note)"
```

---

### Task 1.10: Drawing XML 全体アセンブラ

**Files:**
- Modify: `core/excel/emitter.js`
- Create: `core/excel/__tests__/drawing-xml.test.mjs`

- [ ] **Step 1: テストを書く**

`core/excel/__tests__/drawing-xml.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDrawingXml } from '../emitter.js';

test('buildDrawingXml: empty AST produces valid empty drawing', () => {
  const ast = {
    canvas: { width: 400, height: 200, grid: 20 },
    blocks: [], groups: [], notes: [], connections: [],
    blockMap: {}
  };
  const xml = buildDrawingXml(ast);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'));
  assert.ok(xml.includes('xdr:wsDr'));
  assert.ok(xml.includes('xmlns:xdr='));
  assert.ok(xml.includes('xmlns:a='));
});

test('buildDrawingXml: minimal AST emits all shape types in z-order', () => {
  const ast = {
    canvas: { width: 400, height: 200, grid: 20 },
    blocks: [
      { id: 'a', label: 'A', x: 1, y: 1, w: 3, h: 2, color: '#FF0000', textColor: '#FFF', borderColor: null, round: 0, style: 'solid' },
      { id: 'b', label: 'B', x: 8, y: 1, w: 3, h: 2, color: '#00FF00', textColor: '#FFF', borderColor: null, round: 0, style: 'solid' }
    ],
    groups: [
      { id: 'g', label: 'G', x: 0, y: 0, w: 12, h: 4, color: '#EEEEEE', borderColor: '#999999' }
    ],
    notes: [
      { id: 'n', label: 'N', x: 0, y: 5, w: 5, h: 2, color: '#FEF3C7', textColor: '#92400E', borderColor: null, round: 4, style: 'solid' }
    ],
    connections: [
      { from: 'a', to: 'b', label: 'r', color: '#000000', style: 'solid', width: 1, bidir: false }
    ],
    blockMap: { a: { x: 1, y: 1, w: 3, h: 2 }, b: { x: 8, y: 1, w: 3, h: 2 } }
  };
  const xml = buildDrawingXml(ast);
  const groupIdx = xml.indexOf('group:g');
  const connIdx = xml.indexOf('conn:0');
  const labelIdx = xml.indexOf('connlabel:0');
  const blockAIdx = xml.indexOf('block:a');
  const noteIdx = xml.indexOf('note:n');
  assert.ok(groupIdx < connIdx, 'group before connection');
  assert.ok(connIdx < labelIdx, 'connection before label');
  assert.ok(labelIdx < blockAIdx, 'label before block');
  assert.ok(blockAIdx < noteIdx, 'block before note');
});

test('buildDrawingXml: skips connection with missing endpoint and warns', () => {
  const ast = {
    canvas: { width: 400, height: 200, grid: 20 },
    blocks: [{ id: 'a', label: 'A', x: 1, y: 1, w: 3, h: 2, color: '#FFF', textColor: '#000', borderColor: null, round: 0, style: 'solid' }],
    groups: [], notes: [],
    connections: [{ from: 'a', to: 'nonexistent', label: '', color: '#000000', style: 'solid', width: 1, bidir: false }],
    blockMap: { a: { x: 1, y: 1, w: 3, h: 2 } }
  };
  const xml = buildDrawingXml(ast);
  assert.ok(!xml.includes('conn:0'));  // 不正な接続はスキップ
});
```

- [ ] **Step 2: テスト実行（FAIL）**

- [ ] **Step 3: 実装**

`core/excel/emitter.js` に追加:

```javascript
export function buildDrawingXml(ast) {
  const gridPx = ast.canvas?.grid || 20;
  const items = [];

  (ast.groups || []).forEach((g, i) => items.push({ kind: 'group', data: g, srcIndex: i }));

  (ast.connections || []).forEach((c, i) => {
    const ep = computeConnectionEndpoints(c, ast.blockMap || {}, gridPx);
    if (!ep) {
      console.warn(`[excel-emitter] skipping connection: ${c.from} -> ${c.to} (endpoint missing)`);
      return;
    }
    items.push({ kind: 'connection', data: c, srcIndex: i, endpoints: ep, connIndex: i });
    if (c.label) {
      items.push({ kind: 'connlabel', data: c, srcIndex: i, endpoints: ep, connIndex: i });
    }
  });

  (ast.blocks || []).forEach((b, i) => items.push({ kind: 'block', data: b, srcIndex: i }));
  (ast.notes || []).forEach((n, i) => items.push({ kind: 'note', data: n, srcIndex: i }));

  const sorted = sortByZOrder(items);

  let shapeId = 1;
  const anchorXmls = sorted.map(item => {
    switch (item.kind) {
      case 'group': return buildGroupShape(item.data, shapeId++, gridPx);
      case 'connection': return buildConnectionShape(item.data, item.connIndex, item.endpoints, shapeId++);
      case 'connlabel': return buildConnectionLabel(item.data, item.connIndex, item.endpoints, shapeId++);
      case 'block': return buildBlockShape(item.data, shapeId++, gridPx);
      case 'note': return buildNoteShape(item.data, shapeId++, gridPx);
      default: return '';
    }
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"` +
    ` xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"` +
    ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    anchorXmls.join('') +
    `</xdr:wsDr>`;
}
```

- [ ] **Step 4: テスト実行（PASS）**

```sh
npm test
```

期待: 全テスト PASS（既存テストも含む）

- [ ] **Step 5: コミット**

```sh
git add core/excel/emitter.js core/excel/__tests__/drawing-xml.test.mjs
git commit -m "feat(excel): add buildDrawingXml top-level assembler with z-order"
```

---

### Task 1.11: Xlsx Packager（zip 生成）

**Files:**
- Modify: `core/excel/emitter.js`
- Create: `core/excel/__tests__/packager.test.mjs`
- Create: `core/excel/template-loader.mjs`

- [ ] **Step 1: Node 用 template-loader を作る**

`core/excel/template-loader.mjs`:

```javascript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKELETON_DIR = join(__dirname, 'template-skeleton');

const FILES = [
  '[Content_Types].xml',
  '_rels/.rels',
  'xl/workbook.xml',
  'xl/_rels/workbook.xml.rels',
  'xl/worksheets/sheet1.xml',
  'xl/worksheets/_rels/sheet1.xml.rels',
  'xl/drawings/_rels/drawing1.xml.rels'
];

export function loadTemplateFiles() {
  const map = {};
  for (const f of FILES) {
    map[f] = readFileSync(join(SKELETON_DIR, f), 'utf8');
  }
  return map;
}
```

- [ ] **Step 2: パッケージャテストを書く**

`core/excel/__tests__/packager.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { packageXlsx } from '../emitter.js';
import { loadTemplateFiles } from '../template-loader.mjs';

test('packageXlsx: produces a valid zip with all required entries', async () => {
  const templateFiles = loadTemplateFiles();
  const drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>`;
  const bytes = await packageXlsx(templateFiles, drawingXml);
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 100);

  const zip = await JSZip.loadAsync(bytes);
  assert.ok(zip.files['[Content_Types].xml']);
  assert.ok(zip.files['_rels/.rels']);
  assert.ok(zip.files['xl/workbook.xml']);
  assert.ok(zip.files['xl/worksheets/sheet1.xml']);
  assert.ok(zip.files['xl/drawings/drawing1.xml']);
});

test('packageXlsx: drawing1.xml contains the supplied content', async () => {
  const templateFiles = loadTemplateFiles();
  const drawingXml = `<?xml version="1.0"?><xdr:wsDr xmlns:xdr="x"/>`;
  const bytes = await packageXlsx(templateFiles, drawingXml);
  const zip = await JSZip.loadAsync(bytes);
  const content = await zip.files['xl/drawings/drawing1.xml'].async('string');
  assert.equal(content, drawingXml);
});
```

- [ ] **Step 3: テスト実行（FAIL）**

- [ ] **Step 4: 実装**

`core/excel/emitter.js` の冒頭に JSZip インポートを追加（先頭付近）:

```javascript
import JSZip from 'jszip';
```

`core/excel/emitter.js` 末尾に追加:

```javascript
export async function packageXlsx(templateFiles, drawingXml) {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(templateFiles)) {
    zip.file(path, content);
  }
  zip.file('xl/drawings/drawing1.xml', drawingXml);
  return await zip.generateAsync({ type: 'uint8array' });
}
```

- [ ] **Step 5: テスト実行（PASS）**

```sh
npm test
```

- [ ] **Step 6: コミット**

```sh
git add core/excel/emitter.js core/excel/template-loader.mjs core/excel/__tests__/packager.test.mjs
git commit -m "feat(excel): add xlsx packager (JSZip) and Node template loader"
```

---

### Task 1.12: 公開 API `renderXlsx(ast)` と Golden ファイルテスト

**Files:**
- Modify: `core/excel/emitter.js`
- Create: `core/excel/__tests__/golden.test.mjs`
- Create: `core/excel/fixtures/basic.expected-drawing.xml`

- [ ] **Step 1: 公開 API を実装**

`core/excel/emitter.js` 末尾に追加:

```javascript
export async function renderXlsx(ast, opts = {}) {
  const templateFiles = opts.templateFiles || (await loadTemplateFilesAsync());
  const drawingXml = buildDrawingXml(ast);
  return await packageXlsx(templateFiles, drawingXml);
}

async function loadTemplateFilesAsync() {
  // Node 環境では template-loader.mjs を、ブラウザでは window.StableBlockTemplateFiles を使う
  if (typeof window !== 'undefined' && window.StableBlockTemplateFiles) {
    return window.StableBlockTemplateFiles;
  }
  const mod = await import('./template-loader.mjs');
  return mod.loadTemplateFiles();
}
```

- [ ] **Step 2: 期待 drawing.xml の手動生成**

まず実装結果を見て期待ファイルを作る:

```sh
node -e "
import('./core/excel/emitter.js').then(async m => {
  const ast = {
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
  };
  const xml = m.buildDrawingXml(ast);
  require('fs').writeFileSync('core/excel/fixtures/basic.expected-drawing.xml', xml);
  console.log('written, length:', xml.length);
});
" 2>&1 | tail -5
```

期待: `written, length: XXXX` （ファイル生成成功）

人間が中身を確認し、`xlsx-emit-spec.md` の例と整合していることを目視チェック。

- [ ] **Step 3: Golden テストを書く**

`core/excel/__tests__/golden.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { buildDrawingXml, renderXlsx } from '../emitter.js';
import JSZip from 'jszip';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'fixtures');

const parser = new XMLParser({ ignoreAttributes: false, preserveOrder: false });

function normalizeXml(s) {
  // 属性順序を正規化するため、parse → serialize は使わず単純な空白正規化のみ
  return s.replace(/\s+/g, ' ').trim();
}

function basicAst() {
  return {
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
  };
}

test('golden: basic AST produces expected drawing.xml', () => {
  const expected = readFileSync(join(FIXTURE_DIR, 'basic.expected-drawing.xml'), 'utf8');
  const actual = buildDrawingXml(basicAst());
  assert.equal(normalizeXml(actual), normalizeXml(expected));
});

test('golden: renderXlsx produces valid xlsx zip', async () => {
  const bytes = await renderXlsx(basicAst());
  const zip = await JSZip.loadAsync(bytes);
  assert.ok(zip.files['xl/drawings/drawing1.xml']);
  const drawing = await zip.files['xl/drawings/drawing1.xml'].async('string');
  assert.ok(drawing.includes('block:ui'));
  assert.ok(drawing.includes('block:core'));
  assert.ok(drawing.includes('conn:0'));
  assert.ok(drawing.includes('connlabel:0'));
});
```

- [ ] **Step 4: テスト実行（PASS）**

```sh
npm test
```

期待: 全テスト PASS。

- [ ] **Step 5: コミット**

```sh
git add core/excel/emitter.js core/excel/__tests__/golden.test.mjs core/excel/fixtures/basic.expected-drawing.xml
git commit -m "feat(excel): add renderXlsx public API + basic golden file test"
```

---

### Task 1.13: with-group fixture と golden テスト

**Files:**
- Create: `core/excel/fixtures/with-group.sb`
- Create: `core/excel/fixtures/with-group.expected-drawing.xml`
- Modify: `core/excel/__tests__/golden.test.mjs`

- [ ] **Step 1: 入力 fixture を書く**

`core/excel/fixtures/with-group.sb`:

```
@canvas width=400 height=300 grid=20
group app "Application" at 1,1 size 18x8 color=#EEF2FF border=#818CF8
block ui "UI" at 2,3 size 5x3 color=#3B82F6 text=#FFFFFF round=4
block core "Core" at 10,3 size 5x3 color=#10B981 text=#FFFFFF round=4
ui -> core
```

- [ ] **Step 2: 期待 XML を生成**

```sh
node -e "
import('./core/excel/emitter.js').then(async m => {
  const ast = {
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
  };
  require('fs').writeFileSync('core/excel/fixtures/with-group.expected-drawing.xml', m.buildDrawingXml(ast));
  console.log('written');
});
"
```

- [ ] **Step 3: golden テストを追加**

`core/excel/__tests__/golden.test.mjs` 末尾に追加:

```javascript
function withGroupAst() {
  return {
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
  };
}

test('golden: with-group AST matches expected drawing.xml', () => {
  const expected = readFileSync(join(FIXTURE_DIR, 'with-group.expected-drawing.xml'), 'utf8');
  const actual = buildDrawingXml(withGroupAst());
  assert.equal(normalizeXml(actual), normalizeXml(expected));
});
```

- [ ] **Step 4: テスト実行（PASS）**

```sh
npm test
```

- [ ] **Step 5: コミット**

```sh
git add core/excel/fixtures/with-group.sb core/excel/fixtures/with-group.expected-drawing.xml core/excel/__tests__/golden.test.mjs
git commit -m "feat(excel): add with-group fixture and golden test"
```

---

### Task 1.14: with-note fixture と golden テスト

**Files:**
- Create: `core/excel/fixtures/with-note.sb`
- Create: `core/excel/fixtures/with-note.expected-drawing.xml`
- Modify: `core/excel/__tests__/golden.test.mjs`

- [ ] **Step 1: 入力 fixture**

`core/excel/fixtures/with-note.sb`:

```
@canvas width=400 height=300 grid=20
block ui "UI" at 1,3 size 5x3 color=#3B82F6 text=#FFFFFF round=4
block core "Core" at 10,3 size 5x3 color=#10B981 text=#FFFFFF round=4
note memo "重要" at 1,1 size 8x1 color=#FEF3C7 text=#92400E
ui -> core
```

- [ ] **Step 2: 期待 XML 生成**

```sh
node -e "
import('./core/excel/emitter.js').then(async m => {
  const ast = {
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
  };
  require('fs').writeFileSync('core/excel/fixtures/with-note.expected-drawing.xml', m.buildDrawingXml(ast));
  console.log('written');
});
"
```

- [ ] **Step 3: テスト追加**

`core/excel/__tests__/golden.test.mjs` 末尾に追加:

```javascript
function withNoteAst() {
  return {
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
  };
}

test('golden: with-note AST matches expected drawing.xml', () => {
  const expected = readFileSync(join(FIXTURE_DIR, 'with-note.expected-drawing.xml'), 'utf8');
  const actual = buildDrawingXml(withNoteAst());
  assert.equal(normalizeXml(actual), normalizeXml(expected));
});

test('golden: note appears above blocks in z-order', () => {
  const xml = buildDrawingXml(withNoteAst());
  const blockUiIdx = xml.indexOf('block:ui');
  const noteIdx = xml.indexOf('note:memo');
  assert.ok(blockUiIdx < noteIdx, `note (${noteIdx}) should come after block (${blockUiIdx})`);
});
```

- [ ] **Step 4: テスト実行**

```sh
npm test
```

- [ ] **Step 5: コミット**

```sh
git add core/excel/fixtures/with-note.sb core/excel/fixtures/with-note.expected-drawing.xml core/excel/__tests__/golden.test.mjs
git commit -m "feat(excel): add with-note fixture + z-order verification test"
```

---

### Task 1.15: 実際の xlsx を LibreOffice で開けることを手動検証

**Files:**
- Create: `core/excel/__tests__/manual-output.mjs`（手動実行用スクリプト）

- [ ] **Step 1: 実 xlsx 出力スクリプトを作る**

`core/excel/__tests__/manual-output.mjs`:

```javascript
// 手動実行用: 各 fixture から実 xlsx を生成し、ローカルで開く
import { writeFileSync } from 'node:fs';
import { renderXlsx } from '../emitter.js';

const basicAst = {
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
};

const bytes = await renderXlsx(basicAst);
writeFileSync('/tmp/stableblock-basic.xlsx', bytes);
console.log('Written to /tmp/stableblock-basic.xlsx, size:', bytes.length);
```

- [ ] **Step 2: 生成して LibreOffice で確認**

```sh
node core/excel/__tests__/manual-output.mjs
# Windows
start /tmp/stableblock-basic.xlsx
# または Excel が無ければ
# soffice --calc /tmp/stableblock-basic.xlsx
```

期待手動チェック:
- [ ] Excel/LibreOffice が「破損ファイル」エラーを出さない
- [ ] 「UI」「Core」の 2 つの矩形シェイプが見える
- [ ] 矩形は青と緑（DSL の色）に塗られている
- [ ] 「UI」と「Core」を結ぶ矢印（端点矢頭付き）がある
- [ ] 矢印中点に「request」TextBox がある
- [ ] 各シェイプをクリック → 個別選択でき、テキスト編集も可能
- [ ] 各シェイプをドラッグ → 個別に移動できる
- [ ] 図形の塗りつぶし色を右クリック → 個別に変更できる

問題があれば該当タスクに戻って修正。

- [ ] **Step 3: スクリーンショットを記録**

スクリーンショット 1 枚を `core/excel/fixtures/basic-manual-screenshot.png` に置き git に追加（CLAUDE.md の「GUI 変更は実機スクリーンショット検証必須」を遵守）。

- [ ] **Step 4: コミット**

```sh
git add core/excel/__tests__/manual-output.mjs core/excel/fixtures/basic-manual-screenshot.png
git commit -m "test(excel): add manual output script and verification screenshot"
```

---

## Phase 2: HTML スタンドアロン版に統合

### Task 2.1: stableblock.html ツールバーに「Excel」ボタンを追加

**Files:**
- Modify: `stableblock.html:131-132`（PNG ボタン群の後）

- [ ] **Step 1: 現状確認**

`stableblock.html` の L129-132 に既存エクスポートボタンがある:

```html
    <button class="tb tb-accent" onclick="exportSVG()">SVG</button>
    <button class="tb tb-accent" onclick="exportPNG()">PNG</button>
    <button class="tb tb-accent" onclick="exportPNGTransparent()" title="透過背景PNG">PNG透過</button>
    <button class="tb tb-accent" onclick="copyPNG()" title="クリップボードにコピー">📋</button>
```

- [ ] **Step 2: 「Excel」ボタンを追加**

L132 の 📋 ボタンの直後（同じ行内）に追加:

```html
    <button class="tb tb-accent" onclick="exportXlsx()" title="Excel エクスポート">Excel</button>
```

- [ ] **Step 3: コミット**

```sh
git add stableblock.html
git commit -m "feat(excel): add Excel button to standalone toolbar"
```

---

### Task 2.2: stableblock.html に JSZip と emitter.js をインライン読み込み

**Files:**
- Modify: `stableblock.html`

- [ ] **Step 1: `<head>` 末尾（または `<body>` 末尾の `<script>` 群より前）にスクリプトタグを追加**

`stableblock.html` の `</head>` の直前 or 最初の `<script>` タグの直前に追加:

```html
<script src="core/excel/jszip.min.js"></script>
<script type="module">
  // emitter.js を ES Module として読み込み、関数を window グローバルに公開
  import * as Emitter from './core/excel/emitter.js';
  window.StableBlockExcel = Emitter;
</script>
```

注意: `emitter.js` 内の `import JSZip from 'jszip';` はブラウザでは動かない。次ステップで修正する。

- [ ] **Step 2: emitter.js をブラウザ互換に修正**

`core/excel/emitter.js` の冒頭 `import JSZip from 'jszip';` を削除し、代わりに動的に取得するよう変更:

```javascript
// JSZip: Node では require('jszip') 経由、ブラウザでは window.JSZip 経由
function getJSZip() {
  if (typeof window !== 'undefined' && window.JSZip) return window.JSZip;
  // Node 環境
  return require('jszip');
}
```

そして `packageXlsx` 関数内の `new JSZip()` を `new (getJSZip())()` に変更:

```javascript
export async function packageXlsx(templateFiles, drawingXml) {
  const JSZipCls = getJSZip();
  const zip = new JSZipCls();
  for (const [path, content] of Object.entries(templateFiles)) {
    zip.file(path, content);
  }
  zip.file('xl/drawings/drawing1.xml', drawingXml);
  return await zip.generateAsync({ type: 'uint8array' });
}
```

ただし、Node の ESM テストでは `require` が無いので、テスト側でも JSZip を直接 import するか、emitter.js を ESM/CJS デュアル化する必要がある。

代替: テスト時には `packageXlsx` に `JSZipCls` を opts で渡すように変更:

```javascript
export async function packageXlsx(templateFiles, drawingXml, opts = {}) {
  const JSZipCls = opts.JSZip || (typeof window !== 'undefined' ? window.JSZip : null);
  if (!JSZipCls) throw new Error('JSZip not available; pass via opts.JSZip in Node');
  const zip = new JSZipCls();
  for (const [path, content] of Object.entries(templateFiles)) {
    zip.file(path, content);
  }
  zip.file('xl/drawings/drawing1.xml', drawingXml);
  return await zip.generateAsync({ type: 'uint8array' });
}

export async function renderXlsx(ast, opts = {}) {
  const templateFiles = opts.templateFiles || (await loadTemplateFilesAsync());
  const drawingXml = buildDrawingXml(ast);
  return await packageXlsx(templateFiles, drawingXml, opts);
}
```

- [ ] **Step 3: テストを更新（JSZip を渡す）**

`core/excel/__tests__/packager.test.mjs` および `golden.test.mjs` で `renderXlsx`/`packageXlsx` 呼び出し時に `{ JSZip }` を渡すよう変更:

```javascript
import JSZip from 'jszip';
// ...
const bytes = await packageXlsx(templateFiles, drawingXml, { JSZip });
// ...
const bytes = await renderXlsx(basicAst(), { JSZip });
```

- [ ] **Step 4: テスト実行**

```sh
npm test
```

期待: 全テスト PASS。

- [ ] **Step 5: コミット**

```sh
git add stableblock.html core/excel/emitter.js core/excel/__tests__/
git commit -m "feat(excel): wire emitter.js into stableblock.html via dependency injection"
```

---

### Task 2.3: stableblock.html に `exportXlsx()` 関数を追加

**Files:**
- Modify: `stableblock.html`

- [ ] **Step 1: `exportSVG` 関数の近く（L770 周辺）に追加**

L774 の `function copyPNG()` の直後に追加:

```javascript
async function exportXlsx() {
  if (!parsed) { alert('図がパースされていません'); return; }
  try {
    const bytes = await window.StableBlockExcel.renderXlsx(parsed, {
      JSZip: window.JSZip,
      templateFiles: window.StableBlockTemplateFiles
    });
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    download('diagram.xlsx', url);
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('Excel エクスポート失敗: ' + e.message);
    console.error(e);
  }
}
```

- [ ] **Step 2: template-skeleton のファイル群を `window.StableBlockTemplateFiles` に inline 登録**

`<head>` 内の Module スクリプトに追加（Task 2.2 で書いたもの）:

```html
<script type="module">
  import * as Emitter from './core/excel/emitter.js';
  window.StableBlockExcel = Emitter;
  // template-skeleton をフェッチしてグローバルに保持
  const PATHS = [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/worksheets/sheet1.xml',
    'xl/worksheets/_rels/sheet1.xml.rels',
    'xl/drawings/_rels/drawing1.xml.rels'
  ];
  window.StableBlockTemplateFiles = {};
  Promise.all(PATHS.map(async p => {
    const r = await fetch('./core/excel/template-skeleton/' + p);
    window.StableBlockTemplateFiles[p] = await r.text();
  })).then(() => console.log('Excel template loaded'));
</script>
```

- [ ] **Step 3: ローカルでブラウザ動作確認**

```sh
# Python の HTTP サーバーで配信（file:// だと fetch がブロックされる）
python -m http.server 8000
```

ブラウザで `http://localhost:8000/stableblock.html` を開く。

検証チェックリスト:
- [ ] ページが正常に表示される
- [ ] ブラウザコンソールに `Excel template loaded` が出る
- [ ] 「Excel」ボタンが表示される
- [ ] サンプル DSL を入力（例: 既存サンプルか basic.sb の内容を貼る）
- [ ] 「Excel」ボタンクリック → `diagram.xlsx` がダウンロードされる
- [ ] ダウンロードしたファイルを Excel で開く → エラーなし
- [ ] 各ブロックが個別シェイプとして選択・編集できる

- [ ] **Step 4: スクリーンショット記録**

スクリーンショットを `docs/screenshots/excel-html-export.png` として保存・コミット。

- [ ] **Step 5: コミット**

```sh
git add stableblock.html docs/screenshots/excel-html-export.png
git commit -m "feat(excel): integrate Excel export button into HTML standalone"
```

---

## Phase 3: VSCode 拡張に統合

### Task 3.1: webview ツールバーに「Excel」ボタンを追加

**Files:**
- Modify: `vscode-stableblock/src/extension.js:222`

- [ ] **Step 1: 既存ボタン行を確認**

`vscode-stableblock/src/extension.js` L222:

```javascript
<div class="sep"></div><button class="tb" onclick="exportSVG()">SVG</button><button class="tb" onclick="exportPNG()">PNG</button><button class="tb" onclick="exportPNGT()">PNG&#x2205;</button><button class="tb" onclick="copyPNG()">&#x2398; Copy</button>
```

- [ ] **Step 2: Excel ボタンを追加**

L222 を次のように変更:

```javascript
<div class="sep"></div><button class="tb" onclick="exportSVG()">SVG</button><button class="tb" onclick="exportPNG()">PNG</button><button class="tb" onclick="exportPNGT()">PNG&#x2205;</button><button class="tb" onclick="copyPNG()">&#x2398; Copy</button><button class="tb" onclick="exportXlsx()">Excel</button>
```

- [ ] **Step 3: コミット**

```sh
git add vscode-stableblock/src/extension.js
git commit -m "feat(excel): add Excel button to VSCode webview toolbar"
```

---

### Task 3.2: webview 側 `exportXlsx()` と emitter.js のインライン埋め込み

**Files:**
- Modify: `vscode-stableblock/src/extension.js`

- [ ] **Step 1: 拡張ホスト側で emitter.js と JSZip を文字列としてロード**

`extension.js` の `getWebviewContent(dslText)` 関数の冒頭で、リポジトリの emitter.js / JSZip / template-skeleton ファイルを文字列として読み込む処理を追加:

L176 の `function getWebviewContent(dslText) {` を修正:

```javascript
function getWebviewContent(dslText) {
  const dslJson = JSON.stringify(dslText);

  // Excel 用のスクリプトとテンプレートを inline で埋め込み
  const path = require('path');
  const fs = require('fs');
  const REPO_ROOT = path.resolve(__dirname, '../..');  // vscode-stableblock/src/ から見て 2つ上が main 直下
  let emitterScript = '';
  let jszipScript = '';
  const templateFiles = {};
  try {
    emitterScript = fs.readFileSync(path.join(REPO_ROOT, 'core/excel/emitter.js'), 'utf8');
    jszipScript = fs.readFileSync(path.join(REPO_ROOT, 'core/excel/jszip.min.js'), 'utf8');
    const TPL = ['[Content_Types].xml','_rels/.rels','xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/worksheets/sheet1.xml','xl/worksheets/_rels/sheet1.xml.rels','xl/drawings/_rels/drawing1.xml.rels'];
    for (const f of TPL) {
      templateFiles[f] = fs.readFileSync(path.join(REPO_ROOT, 'core/excel/template-skeleton', f), 'utf8');
    }
  } catch (e) {
    console.error('[stableblock] Failed to load Excel emitter assets:', e.message);
  }
  const templateFilesJson = JSON.stringify(templateFiles);

  // 既存の return `<!DOCTYPE html>...` の中身に追記
  // ... (既存の HTML 生成コードは下方にある)
```

emitter.js はブラウザ ESM 形式なので、`<script type="module">` で読み込む必要があるが、webview の制約で `import` が使えない場合がある。回避策として、emitter.js の `export` を `window.StableBlockExcel.xxx` 形式に変換するスクリプトを挟む。

- [ ] **Step 2: emitter.js を webview-friendly に変換するスクリプトを足す**

`extension.js` の `getWebviewContent` 内で `emitterScript` 取得後に変換:

```javascript
  // ESM の export 文を window グローバル代入に変換（webview は file:// 制約があるため）
  const emitterAsGlobals = emitterScript
    .replace(/^\s*export\s+function\s+(\w+)/gm, 'function $1')
    .replace(/^\s*export\s+(async\s+function\s+\w+)/gm, '$1')
    + '\n;window.StableBlockExcel = { pxToEmu, gridToEmu, escapeXml, normalizeColor, buildBlockShape, buildGroupShape, buildNoteShape, centerOfShape, computeConnectionEndpoints, buildConnectionShape, buildConnectionLabel, sortByZOrder, buildDrawingXml, packageXlsx, renderXlsx };';
```

- [ ] **Step 3: HTML テンプレートに inline スクリプトを埋め込む**

`getWebviewContent` の return 文の `<head>` 内に追加（既存の `<style>` などより後）:

```javascript
return `<!DOCTYPE html>
<html>
<head>
  <!-- ... 既存 ... -->
  <script>${jszipScript}</script>
  <script>${emitterAsGlobals}</script>
  <script>
    window.StableBlockTemplateFiles = ${templateFilesJson};
  </script>
</head>
<!-- ... 既存 body ... -->
`;
```

- [ ] **Step 4: webview body の末尾近くに `exportXlsx()` を追加**

L560 の `function copyPNG()` の直後（同じ `<script>` 内）に追加:

```javascript
function exportXlsx(){
  try {
    if (!parsed) { vscodeApi.postMessage({type:'info',text:'図がパースされていません'}); return; }
    window.StableBlockExcel.renderXlsx(parsed, { JSZip: window.JSZip, templateFiles: window.StableBlockTemplateFiles }).then(function(bytes){
      // bytes は Uint8Array なので base64 化して postMessage
      var binary = '';
      for (var i=0; i<bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      var b64 = btoa(binary);
      vscodeApi.postMessage({ type: 'exportXlsx', data: b64 });
    }).catch(function(e){
      vscodeApi.postMessage({ type: 'info', text: 'Excel エクスポート失敗: ' + e.message });
    });
  } catch (e) {
    vscodeApi.postMessage({ type: 'info', text: 'Excel エクスポート失敗: ' + e.message });
  }
}
```

- [ ] **Step 5: コミット**

```sh
git add vscode-stableblock/src/extension.js
git commit -m "feat(excel): inline emitter and JSZip into VSCode webview + add exportXlsx()"
```

---

### Task 3.3: 拡張ホスト側 `exportXlsx` postMessage ハンドラ追加

**Files:**
- Modify: `vscode-stableblock/src/extension.js:55-69`（既存の `exportSVG`/`exportPNG` ハンドラ近く）

- [ ] **Step 1: ハンドラ追加**

L62-68 の `if (msg.type === "exportPNG")` ブロックの直後に追加:

```javascript
        if (msg.type === "exportXlsx") {
          const uri = await vscode.window.showSaveDialog({
            filters: { "Excel": ["xlsx"] },
            defaultUri: vscode.Uri.file("diagram.xlsx")
          });
          if (uri) {
            // base64 デコード
            const buf = Buffer.from(msg.data, 'base64');
            await vscode.workspace.fs.writeFile(uri, buf);
            vscode.window.showInformationMessage("Excel ファイルを書き出しました: " + uri.fsPath);
          }
        }
```

- [ ] **Step 2: コミット**

```sh
git add vscode-stableblock/src/extension.js
git commit -m "feat(excel): add extension-host exportXlsx save dialog handler"
```

---

### Task 3.4: VSCode 拡張のパッケージ化と手動検証

**Files:**
- `vscode-stableblock/package.json`（バージョン更新）

- [ ] **Step 1: バージョン更新**

`vscode-stableblock/package.json` の `version` を `0.6.0` から `0.7.0-excel.0` に変更（テスト版を示す）。

- [ ] **Step 2: 拡張をビルドしてインストール**

```sh
cd vscode-stableblock
npx vsce package --allow-missing-repository
code --install-extension stableblock-0.7.0-excel.0.vsix
```

期待: インストール成功。

- [ ] **Step 3: VSCode で動作確認**

1. 任意の `.sb` ファイルを開く
2. `Ctrl+Shift+V` でプレビュー
3. ツールバーに「Excel」ボタンがあることを確認
4. ボタンクリック → 保存ダイアログが出る
5. `test.xlsx` として保存
6. Excel/LibreOffice で開く → エラーなし、シェイプ表示

- [ ] **Step 4: スクリーンショット記録**

スクリーンショット 2 枚を保存:
- `docs/screenshots/excel-vscode-button.png` （webview のボタン）
- `docs/screenshots/excel-vscode-output.png` （Excel で開いた状態）

- [ ] **Step 5: コミット**

```sh
git add vscode-stableblock/package.json docs/screenshots/excel-vscode-button.png docs/screenshots/excel-vscode-output.png
git commit -m "test(excel): VSCode integration verified, version 0.7.0-excel.0"
```

---

## Phase 4: 最終検証と受け入れ基準確認

### Task 4.1: 受け入れ基準を1つずつチェック

**Files:**
- Create: `docs/superpowers/specs/2026-05-21-excel-export-acceptance.md`

- [ ] **Step 1: チェックリストを作成**

`docs/superpowers/specs/2026-05-21-excel-export-acceptance.md`:

```markdown
# Excel Export 受け入れ確認 (2026-05-21)

仕様書: `2026-05-21-excel-export-design.md` §10 受け入れ基準

## 自動テスト

- [ ] `npm test` 全パス (X tests, X pass, 0 fail)

## 手動検証

### HTML 版

- [ ] `fixtures/basic.sb` を HTML 版にロードして Excel ボタン → 正常な xlsx ダウンロード
- [ ] `fixtures/with-group.sb` 同様
- [ ] `fixtures/with-note.sb` 同様

### VSCode 拡張

- [ ] `fixtures/basic.sb` をプレビュー → Excel ボタン → 保存 → 正常な xlsx

### Excel 上での編集確認 (Excel 365)

- [ ] 各シェイプを個別選択できる
- [ ] テキストをダブルクリックで編集できる
- [ ] 色を右クリック → 個別変更できる
- [ ] ドラッグで位置を変更できる
- [ ] ハンドルでサイズを変更できる

### LibreOffice Calc での確認

- [ ] basic.xlsx が LibreOffice Calc で開ける（エラーなし）
- [ ] レイアウトが Excel と同じ

### 既存 Excel 設計書への貼り付け確認

- [ ] 任意の既存 .xlsx を開く
- [ ] エクスポートした diagram.xlsx を開く
- [ ] 全シェイプ選択 → コピー → 既存ブックに貼り付け
- [ ] 貼り付け先でシェイプが表示・編集できる
```

- [ ] **Step 2: チェックリストを実行し、各項目にチェックを入れる**

問題があれば該当 Phase のタスクに戻って修正。

- [ ] **Step 3: コミット**

```sh
git add docs/superpowers/specs/2026-05-21-excel-export-acceptance.md
git commit -m "docs(excel): acceptance verification checklist"
```

---

### Task 4.2: README と CHANGELOG を更新

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: README に Excel エクスポートを追記**

`README.md` の「### エクスポート/変換」セクションに行を追加:

```markdown
- **Excel エクスポート** — `.xlsx` 出力。各図形は Excel ネイティブシェイプとして個別に編集可能
```

- [ ] **Step 2: CHANGELOG にエントリ追加**

`CHANGELOG.md` の冒頭に追加:

```markdown
## [Unreleased]
### Added
- Excel (.xlsx) エクスポート機能 (HTML 版 / VSCode 拡張)
  - ブロック・接続線・グループ・注釈をネイティブ Excel シェイプとして出力
  - 各シェイプを Excel 上で個別にテキスト・色・位置・サイズ編集可能
  - 既存設計書へのコピー＆貼り付け用途を想定
```

- [ ] **Step 3: コミット**

```sh
git add README.md CHANGELOG.md
git commit -m "docs(excel): update README and CHANGELOG with Excel export feature"
```

---

### Task 4.3: PR 作成準備（ローカル）

**Files:** なし

- [ ] **Step 1: ブランチログ確認**

```sh
git log main..HEAD --oneline
```

期待: ここまでの全コミットが順に並ぶ（約 25 件）。

- [ ] **Step 2: 全体 diff サマリ**

```sh
git diff --stat main..HEAD
```

期待: 主に `core/excel/`, `stableblock.html`, `vscode-stableblock/src/extension.js`, `docs/`, `package.json`, `.gitignore` のみ変更。

- [ ] **Step 3: PR 作成は手動でユーザーに依頼**

CLAUDE.md ルール「私の承認を得ずに GitHub の main ブランチにアクセスすること(Pull,Fetch 以外)」に従い、PR 作成・push はユーザー承認待ち。

ユーザーに対して以下を提示:

> 「Phase 1 (JS+HTML+VSCode) の実装が完了しました。`feat/excel-export-design` ブランチに約 25 コミットあります。PR を作成してよろしいですか？ 作成する場合は `gh pr create` をユーザー側で実行するか、私が承認後に実行します。」

---

## 後続プラン（参考）

本プラン完了後、以下を別プランで対応:
- **Plan 2**: Python 版 emitter + MCP ツール `sb_export_xlsx` の実装（`feature/mcp-server` が main にマージされた後）
- **Plan 3**: 接続線追従（Excel コネクター Binding）
- **Plan 4**: 既存 `.xlsx` への直接挿入機能

---
