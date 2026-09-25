# Changelog

All notable changes to StableBlock will be documented in this file.

## [Unreleased]

### Added
- BLK-owner-20260925-2011-prune: 注釈を触る入口を通常モードの 1 つに統合(ツールバーの「✎ 編集」の注釈だけモードを畳み、「◇ 注釈」は表示/非表示の切替として残して title に置き方・選び方を案内)。VSCode 拡張で note が選べなかった不具合(選択の整理が noteMap を見ていた)も直した
- BLK-owner-20260925-1921-5: エラー表示が理由を示す(書き間違えた語・欠けた部分と書式)。存在しない ID への接続をエラーに、block の重なり・線が別の block の上を横切ること・同じ組の 2 本目を警告に出し、ステータスバーに Err / Warn の数。`npm run check -- <.sb|フォルダ>` で図を開かずに同じ診断(HTML 版 / VSCode 拡張 / CLI 共通の `core/check/`)
- BLK-owner-20260925-1921-6: 書き出しで情報が黙って落ちないようにした。Mermaid は note(旗形ノード)・色(style / linkStyle)・空の group・note との接続(点線)も書き、表せないもの(座標・大きさ、route= / lpos=、存在しない ID への接続)は書き出し後に画面右下へ一覧で示す。Excel の接続線は図形に接着(stCxn / endCxn)され、Excel で図形を動かすと線が付いてくる。note との接続も Excel に出る(HTML 版 / VSCode 拡張、共通ロジックは `core/mermaid/` と `core/excel/`)
- BLK-owner-20260925-1921-4: ID をプロパティ欄の「ID」で決め・変えられる(表記はそのまま、接続の参照も追従)。新しい要素の ID はラベルの入力に追従し、「ID補正」ボタンは畳んだ(HTML 版と VSCode 拡張)
- BLK-owner-20260925-1921-1: 作図 UI で置いた要素がキャンバスからはみ出すと `@canvas` 行が自動で広がる。ツール欄でキャンバス寸法を変えられ、ツールバーの「全体表示」(F キー)で図全体を画面に収められる。「+ ブロック追加」「+ グループ追加」は空き位置に並べて置く(HTML 版 / VSCode 拡張)
- BLK-owner-20260925-1921-2: キャンバスの選択を draw.io と同じ規則にそろえた。選択済みの要素を動かさずにクリックするとその 1 つに絞られ(2 つ選んで結ぶ操作を続けても選択が膨らまない)、Esc とプレビューの余白クリックで選択が外れ、ステータスバーの Selected: N が追従し、本文から消えた要素はプロパティ欄に残らない(HTML 版 / VSCode 拡張、共通ロジックは `core/select/`)
- BLK-owner-20260925-1921-3: 注釈(note)が既定で表示され、ツール欄の「+ 注釈追加」1 回で置け、通常モードのまま block と同じに選択・移動・リサイズでき、Ctrl+A → Delete で note も消える(HTML 版と VSCode 拡張)
- BLK-owner-20260925-1921-prune: 接続を作る入口を「2 つ選んで a → b」の 1 つに統合(from/to の ID 入力欄と「色を指定して接続」を畳み、案内 1 行に置換。色は結んだ後に「線の色」で変える。HTML 版と VSCode 拡張の両方)
- BLK-human-20260925-1900: E2E の基盤(`npm run test:e2e`、worker ごとの静的サーバ、`tests/e2e/scenarios/` の雛形 2 本)と、porter コーパスの .sb を parse → 直列化で往復するバイト一致テスト(`core/dsl/`)
- Excel (.xlsx) エクスポート機能 (HTML 版 / VSCode 拡張)
  - ブロック・接続線・グループ・注釈をネイティブ Excel シェイプとして出力
  - 各シェイプを Excel 上で個別にテキスト・色・位置・サイズ編集可能
  - 既存設計書へのコピー＆貼り付け用途を想定
- 接続線ラベルをプロパティパネルから入力可能に(HTML版/VSCode拡張)
- 接続線ラベルの位置指定 `lpos=right|left|top|bottom|center` を追加(デフォルト: 右)
- 接続線ラベルに白背景矩形を追加、曲線・直角経路でも線上の幾何中点に配置

### Fixed
- VSCode拡張: VSIX に `core/` ランタイム資産を同梱(パッケージング前に自動コピー)し、
  インストール版でのExcelエクスポート・接続ラベル動作(接続線描画そのもの)が
  機能しない不具合を修正

## [0.6.0] - 2026-03-23

### Added
- **Annotation layer**: `note` DSL syntax, separate rendering layer on top of blocks
  - Show/hide toggle (◇ 注釈 / N key)
  - Edit mode toggle (✎ 編集) — locks blocks, only notes interactive
  - Notes dim blocks at 35% opacity for visual clarity
  - Textarea input for multi-line note text
  - Note-to-block connections (always dashed)
- **Snap guides**: yellow alignment lines shown when dragging near other block edges
- **Search/filter**: toolbar search input dims non-matching elements
- **Multi-select → Group**: create a group around selected blocks with one click
- **Connection width**: `width=N` DSL attribute (1, 1.5, 2, 3, 4) with property panel buttons
- **Connection style**: solid/dashed toggle in property panel for connections
- **Image export enhancements**: transparent PNG, clipboard copy
- **Mermaid export**: convert diagram to Mermaid flowchart TD format
- **@include support**: `@include "file.sb"` preprocessor directive (HTML: fetch-based)
- **Git visual diff**: side-by-side SVG diff with HEAD (VSCode command)

## [0.5.2] - 2026-03-18

### Fixed
- VSCode preview not loading due to regex SyntaxError in Fix ID function (#7)

## [0.5.1] - 2026-03-18

### Added
- Connection line color picker when two blocks are selected
- ID auto-fix: new blocks/groups get `__new_N` placeholder IDs, "ID補正" / "Fix ID" button renames them from labels
- Arrow key movement for selected blocks and groups
- Add block inside group from property panel
- Connection management (connect, delete, flip, bidirectional) when two blocks are selected

### Changed
- Connection routing: edge-gap based side selection for more natural arrow faces
- Connection routing: bezier curves with control-point tangents for smooth lines
- Connection routing: port distribution to separate overlapping connections

### Infrastructure
- Centralized version management via `VERSION` file and `bump-version.sh`

## [0.5.0] - 2026-03-17

### Added
- Highlight mode to dim unconnected blocks (H key or toolbar button)
- Property panel enhancements (stepper inputs, color pickers, style selectors)

## [0.4.4] - 2026-03-17

### Fixed
- Copy/cut/paste shortcuts in VSCode webview preview (#1)
- Ctrl+C/X/V handled via webview keydown + clipboard events

## [0.4.3] - 2026-03-17

### Fixed
- VSCode keyboard shortcuts not reaching webview (#1)
- Label input losing focus on every keystroke (#2)
- Empty label accidentally deleting block (#2)

## [0.1.0] - 2026-03-16

### Added
- Initial release
- StableBlock DSL parser and renderer
- Single-file HTML editor with live preview
- VSCode extension with syntax highlighting and preview panel
- SVG and PNG export
- Grid-based deterministic positioning
- Blocks, groups, and connections
