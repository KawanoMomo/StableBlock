# StableBlock — Excel エクスポート設計

- **作成日**: 2026-05-21
- **対象バージョン**: v0.7.0 想定
- **ステータス**: ドラフト（承認待ち）

## 1. 目的と背景

StableBlock の図を、既存の Excel 設計書に貼り付けて使えるよう、`.xlsx` 形式でエクスポートする。Excel 上では各図形（ブロック・接続線・グループ・注釈）が**ネイティブシェイプ**として個別選択・編集できる状態であることを要件とする。

### 想定ワークフロー

1. ユーザーが `.sb` を編集してレイアウト確定
2. 「Excel エクスポート」を実行 → 新規 `.xlsx` を生成
3. ユーザーが生成 `.xlsx` を Excel で開く
4. シェイプを全選択 → コピー
5. 既存の設計書ブックの目的シートに貼り付け
6. Excel 上で**テキスト・色・位置・サイズ**を必要に応じて微調整

### 用途と非用途

- **用途**: 既存 Excel 設計書への組み込み（片道）
- **非用途**: Excel 編集結果を `.sb` に戻す（双方向）、非エンジニア向けレビュー資料、最終納品物としての印刷整形

## 2. 要件サマリ

| 項目 | 確定内容 |
|---|---|
| 出力対象環境 | HTML 版 / VSCode 拡張 / MCP サーバー の 3 つすべて |
| エクスポート要素 | ブロック・接続線・グループ・注釈 すべて |
| Excel 上の表現 | ネイティブシェイプ（オートシェイプ）。テキスト・色・位置・サイズが個別編集可能 |
| 取り込み方式 | 新規 `.xlsx` を生成 → 手動コピー＆貼り付け |
| 配置スケール | 絶対座標で配置（セルサイズはデフォルトのまま） |
| 編集方向 | 片道（StableBlock → Excel） |

## 3. アーキテクチャ

既存の `render`（DSL → SVG）と並列に、`renderXlsx`（DSL → xlsx）という **第 2 のレンダラー** を追加する。両者は `parseDSL` 出力の同じ AST を入力に取る。

```
                       ┌─────────────────────────┐
                       │   .sb (DSL テキスト)     │
                       └────────────┬────────────┘
                                    │
                              parseDSL (既存)
                                    │
                                    ▼
                  ┌────────────────────────────────────┐
                  │ AST: { canvas, groups, blocks,     │
                  │        notes, connections }        │
                  └─────┬──────────────────────────┬───┘
                        │                          │
                  render (既存)              renderXlsx (新規)
                        │                          │
                        ▼                          ▼
                      SVG                       .xlsx blob/file
```

### 実装方針: 仕様書駆動・各環境ネイティブ実装

`docs/superpowers/specs/xlsx-emit-spec.md`（このドキュメントの兄弟ファイル、別途作成）を**正典**として、各環境で**同じ仕様に従って Drawing XML を生成**する。

- HTML 版・VSCode 拡張: JS 実装 `core/excel/emitter.js`（共有）
- MCP サーバー: Python 実装 `mcp-server/src/stableblock_mcp/excel_emitter.py`

両実装が**展開後の XML を正規化したとき同一**となることをクロス環境テストで保証する（zip の圧縮レベル・タイムスタンプはバイト一致しない前提）。

#### なぜこの方針か

ExcelJS / openpyxl などの上位ライブラリは図形 (Drawing) の表現力が限定的で、StableBlock が必要とする丸角・ベジェ接続線・破線スタイル・矢頭種別・テキスト中央寄せ＋折り返しを完全に再現できない。Drawing XML を自前で生成すれば、欲しい表現を 100% 出せ、3 環境の出力が一致する。

## 4. データフロー

`renderXlsx(ast, options) → xlsxBytes` の内部を 5 層に分ける。

### 4.1 Layout Resolver

- DSL グリッド座標（20px = 1grid）を EMU（914400 / inch、9525 / px）に換算
- canvas 全体の左上を `(0, 0)` として絶対座標化
- 純粋関数

### 4.2 Shape Builder

| DSL 要素 | 生成シェイプ |
|---|---|
| `block` | 矩形（roundRect、色、テキスト、丸角） |
| `group` | 背面矩形（半透明 25%、ラベル左上） |
| `note` | 最上面矩形（注釈色） |
| `connection` (`->`) | 直線コネクター + 矢頭 |
| `connection` (`-->`) | 直線コネクター + 両端矢頭 |
| `connection.label` | 線の中点に独立 TextBox |

純粋関数。出力は ShapeIR の配列。

### 4.3 Z-order Sorter

順序: Groups（背面）→ Connections → Blocks → Notes（最上面）

DSL 記述順を tie-breaker に使う（既存 `render` と同ルール）。

### 4.4 Drawing XML Serializer

- `xl/drawings/drawing1.xml` を生成
- 各シェイプに `spId` と `name="block:ui"` 等を埋め込む（再エクスポート時の照合用、将来拡張への布石）
- 純粋関数

### 4.5 Xlsx Packager

- `core/excel/template-skeleton/` に展開済みテンプレートを置く
- `xl/drawings/drawing1.xml` を生成 XML で差し替え
- `xl/worksheets/sheet1.xml` の `<drawing r:id=…>` 参照を確認
- 再 zip → bytes
- 唯一の I/O 層

## 5. コンポーネント一覧

| ファイル | 責務 |
|---|---|
| `core/excel/template-skeleton/` | テンプレート `.xlsx` の zip 展開後の中身（git 管理） |
| `core/excel/xlsx-emit-spec.md` | レイアウト・XML 仕様の正典（人間用、別途作成） |
| `core/excel/test-fixtures/` | サンプル `.sb` と期待 `.xlsx` のペア |
| `core/excel/emitter.js` | JS 版エミッタ（HTML / VSCode から import） |
| `mcp-server/src/stableblock_mcp/excel_emitter.py` | Python 版エミッタ |
| HTML 版 UI | ツールバーに `Excel` ボタン追加 → Blob → ダウンロード |
| VSCode 拡張 UI | コマンド `stableblock.exportExcel` 追加 |
| MCP ツール | `sb_export_xlsx` を `tools/__init__.py` に追加（19 番目のツール） |

## 6. シェイプ表現仕様（重要決定）

### 6.1 ブロック

| StableBlock 属性 | Excel Drawing XML マッピング |
|---|---|
| `at x,y size wxh` | `<xdr:absoluteAnchor>` で EMU 絶対配置 |
| `color=#XXXXXX` | `<a:solidFill>` で塗りつぶし |
| `text=#XXXXXX` | テキストランの `<a:solidFill>` |
| `round=N` | `<a:prstGeom prst="roundRect">` ＋ `adj` でカーブ半径 |
| `border=#XXXXXX`（任意） | `<a:ln>` 線色 |
| ラベル `\n` 改行 | テキストフレームを複数 `<a:p>` に分割、中央寄せ＋折り返し |

### 6.2 グループ

- 矩形シェイプ（背面）。`<a:solidFill>` を半透明 25% 程度に
- ラベルは矩形左上にテキスト埋め込み
- **親子連動は Excel 上では再現しない**（仕様、6.6 参照）

### 6.3 注釈

- Z-order 最上面の通常矩形シェイプ
- シェイプ名に `note:` プレフィックスを付け、将来の双方向化への布石とする

### 6.4 接続線

| 属性 | Drawing XML マッピング |
|---|---|
| `a -> b` | `<a:prstGeom prst="straightConnector1">`、終端に矢頭 |
| `a --> b`（双方向） | 同上だが両端に矢頭（`<a:headEnd>` + `<a:tailEnd>`） |
| ラベル `"text"` | **独立した TextBox** を線の中点に配置 |
| `color=#XXX` | `<a:ln><a:solidFill>` |
| `width=N` | `<a:ln w="EMU">` |
| `style=dashed` | `<a:prstDash val="dash"/>` |

端点座標は **Phase 1 では「ブロック中心から中心への直線」** で算出する。EMU 絶対座標で固定。

注: 既存 `render` 関数のコネクション計算ロジック（ECN-006 接続面選択アルゴリズム）の移植は Phase 2 以降の拡張とする。スコープ縮小の理由は次の通り:
- ECN-006 のロジックは `stableblock.html` 内に inline 実装されており、抽出して emitter から呼び出すためには既存コードのリファクタが必要
- 既存設計書に貼り付ける用途では、端点の見栄えは Excel 上の手動微調整で十分実用的
- Phase 1 を早期に出荷し、ユーザーフィードバックを得てから接続面選択を判断する

### 6.5 キャンバス

- 背景色は塗らない（Excel のセル背景に任せる）
- グリッド表示はオフ（`<sheetView showGridLines="0"/>`）

### 6.6 スコープ外（今期実装しない）

- 接続線の Excel コネクター追従（Binding）。Excel 上でブロックを動かしても**線は追従しない**
- Excel グループ化機能との連動。`group` を一括移動できない
- ECN-006 完全互換の接続面選択アルゴリズム移植（本修正で 4 辺中点ベースの簡易版を実装。SVG プレビューと完全一致は将来課題）
- 既存 `.xlsx` への挿入
- 双方向同期（Excel → `.sb`）
- セル幅自動調整
- 複数シート分割（巨大図でも 1 シート固定）
- 印刷レイアウト調整

## 7. エラー処理

| エラー条件 | 振る舞い |
|---|---|
| `parseDSL` がエラー | `renderXlsx` は呼ばない。UI に DSL エラーを表示 |
| AST にブロック 0 個 | 空シートを出力。警告ログ |
| 接続線の端点ブロックが存在しない | その接続線だけスキップ。`console.warn` で ID 不一致を出す |
| 矩形サイズが 0 以下 | スキップ＋警告 |
| キャンバス幅・高さが EMU 上限超過 | 警告＋当該シェイプをスキップ |
| テンプレート zip 読み込み失敗 | UI にエラー表示、開発者向けログにスタックトレース |

## 8. エッジケース

| ケース | 仕様 |
|---|---|
| `@include` を含む `.sb` | 既存 `parseDSL` で展開済み AST を受け取るのでエミッタは意識不要 |
| 注釈レイヤーが「非表示」状態 | DSL には `note` が残るので**常に出力**。表示/非表示は view 状態であり `.sb` の状態ではない |
| ID 衝突（`__new_` プレースホルダー） | ECN-013 の ID リネーム処理を経た後の AST を使う前提。エミッタは ID 一意性を assert |
| `\n` 改行でテキストがブロックを超える | `<a:bodyPr wrap="square">` で折り返し。フォント自動縮小は実装しない |
| 巨大ファイル（500 ブロック以上） | 動作はする想定だが目標は ~100 ブロック。MVP では性能目標を設定しない |
| 日本語など UTF-8 文字 | UTF-8 で書き出し。XML エスケープ（`&` `<` `>` `"`）を必ず通す |

## 9. テスト方針

### 9.1 黄金ファイル比較テスト（golden file）

- `core/excel/test-fixtures/` に `.sb` と期待 `.xlsx` のペアを置く
- テスト: 入力 `.sb` → エミッタ実行 → 出力 xlsx を zip 展開 → 期待値の XML と diff
- JS 版と Python 版で同じ fixture を共有 → 「3 環境一致」を担保
- XML 比較は属性順序を正規化してから（`xmldom` 等）

### 9.2 ユニットテスト（純粋関数層）

- Layout Resolver: EMU 換算が正しいか（20px → 190500 EMU の境界値）
- Shape Builder: 各 DSL 要素が正しい ShapeIR を生成するか
- Z-order Sorter: 「Groups → Connections → Blocks → Notes」の順
- Drawing XML Serializer: 単一シェイプの XML 生成

### 9.3 レンダリング検証テスト（視覚回帰）

- 黄金 xlsx を LibreOffice Calc headless で PNG に変換
- 既存 `render` の SVG → PNG と並べてスナップショット
- CLAUDE.md 禁止事項「GUI 変更は実機スクリーンショット検証なしに PASS 禁止」を遵守

### 9.4 クロス環境テスト

- 同一 fixture を JS 版・Python 版で別々に実行
- 生成 2 つの `.xlsx` を zip 展開し、各 XML を正規化後に比較（決定論的に同じ XML が出る）

### 9.5 CI 構成

| ジョブ | 内容 |
|---|---|
| `test:js` | Node.js 上で JS 版エミッタの黄金ファイル + ユニット |
| `test:python` | Python 版エミッタの黄金ファイル + ユニット |
| `test:cross` | JS と Python の出力一致確認 |
| `test:render` | LibreOffice headless で視覚スナップショット |

## 10. 受け入れ基準

- [ ] `fixtures/basic.sb`（5 ブロック、3 接続線）が 3 環境で一致する `.xlsx` を出す
- [ ] `fixtures/with-group.sb`（グループ＋子ブロック）が描画される
- [ ] `fixtures/with-note.sb`（注釈レイヤー）が描画される
- [ ] `fixtures/complex.sb`（既存 `examples/` から 30 ブロック程度）が破綻せず描画される
- [ ] Excel で開いてシェイプを選択 → テキスト・色・位置・サイズが個別に変更できる
- [ ] LibreOffice / Excel 365 / Excel 2019 で開けることを手動確認
- [ ] 既存設計書に貼り付け → シェイプが消えない、レイアウトが崩れないことを手動確認

## 11. リスク

| リスク | 影響度 | 対応 |
|---|---|---|
| OOXML Drawing XML 仕様の学習コスト | 中 | 図形まわりに限定すれば 3 日程度。`xlsx-emit-spec.md` に学んだことを蓄積 |
| Excel バージョン間の互換性差異 | 中 | 9.1 の受け入れ基準で Excel 2019 / 365 / LibreOffice を手動確認に含める |
| JS 版と Python 版の出力 drift | 高 | クロス環境テスト（9.4）で常時検証。`xlsx-emit-spec.md` を更新したら両実装を必ず同期 |
| 接続線追従できないことへの不満 | 低 | 仕様として明記。次期スコープで検討 |

## 12. 後続マイルストーン候補（このスペック外）

- 既存 `.xlsx` への直接挿入
- Excel コネクター Binding による接続線追従
- Excel グループ化機能との連動
- Excel → `.sb` 双方向同期
- 印刷整形（用紙サイズ、ヘッダー／フッター）
