# StableBlock — Excel エクスポート視覚再現の修正 設計

- **作成日**: 2026-05-25
- **対象バージョン**: PR #12 (`feat/excel-export-design`) への追加修正
- **ステータス**: ドラフト（承認待ち）
- **前提**: `2026-05-21-excel-export-design.md` の Phase 1 実装 (40 tests passing) が存在する

## 1. 背景

PR #12 で実装した Excel エクスポートを実機で確認したところ、SVG プレビューと比較して 3 つの視覚的乖離が発見された。Phase 1 の golden file テストはOOXML文字列の一致を見るだけで、Excel 上での実際の見た目までは検証していなかったため、これらが見逃された。

### 発見された問題

| # | 現象 | 影響 |
|---|---|---|
| 1 | Excel 上での角の丸みが SVG より大きい | 同じ DSL なのに表現が変わる |
| 2 | フォントが Excel デフォルト (Calibri 系) になり、SVG (IBM Plex + Noto Sans JP) と幅が異なる | テキストがブロックからはみ出す |
| 3 | DSL の `"Line1\nLine2"` が Excel 上にリテラル `\n` (2文字) として表示される | 改行が機能しない |

## 2. 要件サマリ

| 項目 | 確定内容 |
|---|---|
| 修正対象 | `core/excel/emitter.js` の `buildBlockShape`, `buildGroupShape`, `buildConnectionLabel`, `buildNoteShape` (= buildBlock 経由) |
| フォント | 英数字: `Calibri`、日本語 (East Asian): `Yu Gothic UI` を OOXML に明示 |
| 自動縮小 | Block / Note に `<a:normAutofit/>` を追加（テキストはみ出し時の自動縮小） |
| 角の丸み | SVG の `rx` ピクセル値と一致させる（短辺ピクセルに対する比率として adj を算出） |
| 改行 | DSL 上の `\\n`（バックスラッシュ + n の2文字）を改行として解釈 |
| 後方互換 | 既存 golden file は全て再生成（更新前提） |

## 3. 修正内容（詳細）

### 3.1 角の丸み (Bug #1)

**現状（`buildBlockShape` L58）:**
```js
const adj = Math.min(round * 5000, 50000);
```

DSL `round=N` の単位は **ピクセル** (SVG の `rx="N"` と同じ) だが、OOXML `adj` は **短辺に対する 1/100000 の比率**。例えば 60px 高さブロックで `round=4` の場合:

- SVG: `rx=4` = 4 px 半径
- 旧 emit: `adj=20000` = 短辺の 20% = 60px の 20% = 12 px 半径（3 倍丸い）

**修正後:**
```js
const shortPx = Math.min(block.w, block.h) * gridPx;
const adjFromPx = shortPx > 0 ? Math.round((round / shortPx) * 100000) : 0;
const adj = Math.min(Math.max(adjFromPx, 0), 50000);
```

`round=4`, `block.h=3`, `gridPx=20` → `shortPx=60`, `adj=6667` → 60 px × 6.67% = 4 px。SVG とピクセル一致。

`adj` 上限は仕様上 50000 (=50%) なので `Math.min` でクランプ。

### 3.2 フォント明示 + autoFit (Bug #2)

#### `buildBlockShape` の `<a:bodyPr>`
```xml
<a:bodyPr wrap="square" anchor="ctr">
  <a:normAutofit/>
</a:bodyPr>
```
`<a:normAutofit/>` は「テキストがシェイプを超えた場合 Excel が自動でフォントサイズを縮小」する OOXML 機能。

#### `buildBlockShape` の `<a:rPr>`
```xml
<a:rPr lang="ja-JP" sz="1100">
  <a:solidFill><a:srgbClr val="..."/></a:solidFill>
  <a:latin typeface="Calibri"/>
  <a:ea typeface="Yu Gothic UI"/>
</a:rPr>
```

#### `buildGroupShape` の `<a:rPr>`
同様に `<a:latin>`, `<a:ea>` を追加。autoFit は不要（ラベルは左上に小さく出るだけ）。

#### `buildConnectionLabel` の `<a:rPr>`
同様にフォント指定追加。autoFit は不要（独立 TextBox なので元々サイズに余裕がある）。

#### フォント選定理由

| フォント | 採用理由 |
|---|---|
| `Yu Gothic UI` | Win10/11 標準、SVG の Noto Sans JP に最も近い幅・字形のモダンフォント |
| `Calibri` | Office 標準、長年デファクトで安心、英数字でブロック幅をはみ出しにくい |

### 3.3 改行 (Bug #3)

**現状（`buildBlockShape` L64）:**
```js
const labelLines = String(block.label || '').split('\n');
```

JS の `'\n'` は **改行コード 1 文字**。しかし `parseDSL` は `"Line1\nLine2"` を **`\` + `n` の 2 文字** として保持する（DSL 仕様: `\n` でラベル内改行 = `core/CLAUDE.md` 既述）。SVG レンダラ側でこの 2 文字を改行として処理しているが、emitter は同等処理をしていなかった。

**修正後:**
```js
const labelLines = String(block.label || '').split(/\\n|\r?\n/);
```

`/\\n/` は正規表現で **バックスラッシュ + n の 2 文字** にマッチ。`|\r?\n` で念のため real newline も区切り文字に含める（CRLF 環境想定）。

`buildGroupShape`, `buildConnectionLabel` も同様に修正（ラベルが複数行になる可能性は低いが、整合性のため）。

## 4. テスト方針

### 4.1 既存 golden file の再生成

Phase 1 で committed した 3 つの期待出力 XML は本修正で全て変わる:
- `core/excel/fixtures/basic.expected-drawing.xml`
- `core/excel/fixtures/with-group.expected-drawing.xml`
- `core/excel/fixtures/with-note.expected-drawing.xml`

これらは `buildDrawingXml` 実装後に再実行して上書きする。

### 4.2 新規ユニットテスト（必須）

`core/excel/__tests__/shape-builder.test.mjs` に追加:

1. **改行 (DSL 2-char):** `label='A\\nB'` (バックスラッシュエスケープ済み、計 3 文字) → 出力 XML に `<a:p>` が 2 個
2. **改行 (real newline):** `label='A\nB'` (JS リテラルで改行コード 1 文字) → 出力 XML に `<a:p>` が 2 個
3. **改行なし:** `label='AB'` → `<a:p>` 1 個
4. **フォント明示:** 出力 XML が `<a:latin typeface="Calibri"/>` と `<a:ea typeface="Yu Gothic UI"/>` を含む
5. **autoFit:** Block / Note 出力 XML が `<a:normAutofit/>` を含む
6. **adj ピクセル換算:**
   - `block.w=10, block.h=3, gridPx=20, round=4` → `shortPx=60`, `adj=6667`
   - `block.w=5, block.h=5, gridPx=20, round=10` → `shortPx=100`, `adj=10000`
   - `block.w=2, block.h=2, gridPx=20, round=100` → `shortPx=40`, `adj` は計算上 250000 だが上限 50000 にクランプ

### 4.3 spec ドキュメント更新

`core/excel/xlsx-emit-spec.md` の以下セクションを更新:
- Block: adj 算出式、`<a:bodyPr>` 内 autoFit、`<a:rPr>` 内フォント指定
- Group: フォント指定追加
- Connection ラベル: フォント指定追加
- 改行ルール: `\n` (2 文字) を改行として解釈する旨を明記

## 5. 実装順序（プラン作成時の参考）

1. spec ドキュメント (`xlsx-emit-spec.md`) を新仕様で更新
2. shape-builder.test.mjs に新テスト追加（FAIL を確認）
3. emitter.js の `buildBlockShape` 修正（改行 → autoFit → フォント → adj の順、各ステップで commit）
4. `buildGroupShape` 修正
5. `buildConnectionLabel` 修正
6. golden file 再生成 (`basic.expected-drawing.xml` 等を上書き)
7. 全テスト PASS 確認
8. 実機 Excel で目視確認（受け入れチェックリスト追加）

## 6. スコープ外（今期実装しない）

- **フォントの実埋め込み**: `xl/media/` への font ファイル同梱や `<a:embeddedFonts>` 利用。Win10/11 標準フォントに依存する前提
- **ラベル幅に応じた強制折り返し**: `wordWrap` で長単語が途中で折れる挙動制御。autoFit で十分実用
- **`buildGroupShape` の autoFit**: グループラベルは左上に小さく出るだけで原則はみ出さない
- **Linux/macOS 互換**: Yu Gothic UI は Windows 専用。Mac/Linux で開いた時はフォールバックされる前提（仕様）
- **接続線端点ルーティング改善 (ECN-006)**: 別 spec の対象、本 PR の修正範囲外

## 7. 受け入れ基準

- [ ] `npm test` 全パス (40 + 8 新規 = 48 程度の tests)
- [ ] 既存 fixture (basic / with-group / with-note) の golden が新内容で上書きされている
- [ ] HTML 版で実機 Excel エクスポート → 開いて目視で次を確認:
  - [ ] ブロックの角の丸みが SVG プレビューと同程度
  - [ ] テキストがブロックからはみ出していない（はみ出しても自動縮小される）
  - [ ] `\n` を含むラベルが改行されている
  - [ ] フォントが Yu Gothic UI / Calibri で表示されている
- [ ] VSCode 拡張からも同様に動作する

## 8. リスク

| リスク | 影響 | 対応 |
|---|---|---|
| Yu Gothic UI が古い Windows (Win7/8) にない | 表示が代替フォントになる | スコープ外と明記。Win10/11 限定 |
| `<a:normAutofit/>` の挙動が Excel / LibreOffice で異なる | LibreOffice では縮小されない可能性 | 受け入れチェックで Excel 365 を一次確認、LibreOffice は二次 |
| `\\n` split が DSL の他の用法と衝突 | （`\` は DSL 内で他に使われていないはず） | parseDSL の動作を確認、衝突なければ問題なし |
| golden file 更新で diff が大きくなる | レビュー負荷 | 期待動作なので許容 |
