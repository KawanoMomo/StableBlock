# Changelog

All notable changes to StableBlock will be documented in this file.

## [Unreleased]

### Added
- BLK-junior-20260926-1105: 共有部を @include した図でも画布は本文の @canvas のまま(広げた画布が共有部の大きさに戻らず、PNG / SVG が切れない)。共有部の要素を選ぶと定義の場所が出て「○○.sb を開く」で直せる
- BLK-builder-20260926-1230-1: Excel 書き出しで block の太枠・破線枠が画面どおりに出る。Excel で表せない接続の線の形と lpos= は書き出し後の一覧に出る(parser の全属性を unit で検査)
- BLK-primary-20260926-0950: 一緒に読み込んだ図で、ラベル欄 + Enter(キャンバス上のラベル編集の確定も)が同じ ID を定義するほかの図の同じ表示名も揃える。ID 欄の改名と合わせ、ID 小文字・表示名タイトルケースの規約でも 2 回の入力で全図が揃う
- BLK-builder-20260926-1000-1-red: Excel 書き出しの雛形(template-inline.js)の生成と検査が作業ツリーの改行コード(CRLF / LF)に依らなくなり、CRLF のチェックアウトでも unit が緑になる
- BLK-releaser-20260926-0953: bump-version.sh がルートの package.json と package-lock.json の版番号も揃え、置き換える箇所が見つからなければ何も書かずに失敗する(本体は scripts/bump-version.mjs)
- BLK-junior-20260926-0609-wish: 検索欄に件数を出し(0 件で残りが無いと分かる)、Enter / Shift+Enter で当たりを読み順に 1 つずつ選べる。note も検索で薄くなる(HTML 版と VSCode 拡張で共通)
- BLK-porter-20260926-0617: ラベルの二重引用符を `\"` で書けるようになり、`"Block \"quoted\" label"` の図が「.sb 読込」で描かれ、GUI のラベル欄(接続のラベルも)に `"` を打っても本文が壊れず、無変更保存はバイト一致、SVG / Mermaid / Excel にも引用符のまま出る(HTML 版・VSCode 拡張・core/dsl が core/label の同じ規則で読む)
- BLK-human-20260926-1010-1: 資料の寸法に合わせた図はツール欄「はみ出したら自動で広げる」を外して固定できる(本文の @canvas に grow=off)。自動で広がった直後はステータスバーの「元の寸法に戻して固定」1 回で戻せ、キャンバスの外にはみ出した要素はエラー欄に出て画面にも描かれる。VSCode 拡張も同じ
- BLK-primary-20260926-0451: ブラウザ版で「.sb 読込」でまとめて読んだ図をまたいで、ツールバーの検索が表示していない図の定義・接続を図と行で並べ(押すとその図を開く)、プロパティ欄の ID を 1 回変えると全部の図の定義行と接続の from / to が改名され(ID と同じ表示名も揃う)、「.sb 保存」で変わった図が全部書き出される
- BLK-human-20260926-1010-2: プロパティ欄はラベル欄が先頭になり、ID 欄は畳まれて今の ID(「ID: ui」)だけが見える。名前がまだ無い要素(`__new_`)では開いており、「ID:」を押して開くと選び直しても開いたまま(改名はここから。接続の参照も一緒に変わる。HTML 版 / VSCode 拡張)
- BLK-owner-20260926-0609-1: ツールバーの「SVG」「PNG」「透過PNG」「PNGをコピー」が本文だけで決まる同じ絵になる(画面の選択枠・リサイズハンドル・グリッドの点・検索や「未接続を薄く」の薄めが入らず、大きさは表示倍率に依らず SVG は @canvas の寸法、PNG は @canvas × 2)。画面と書き出しの描画は HTML 版と VSCode 拡張で共通の core/render
- BLK-owner-20260926-0609-2: プロパティ欄の X / Y / W / H の ▲ は 1 つ選択でも複数選択でも値を 1 増やす(▼ は 1 減らす)。HTML 版と VSCode 拡張で同じ向き(core/select stepDelta)。矢印キーは画面の向きのまま
- BLK-human-20260926-0930: `npm test` のコーパス往復が persona-data の図の崩れで赤くならない(同梱の .sb だけを assert し、persona-data は `test-results/corpus-roundtrip.json` に結果を書くだけ)
- BLK-owner-20260926-0451-4: block / group / note のラベルをキャンバス上で直せる(ダブルクリック・F2・Enter でその場に入力欄が開き、Enter で確定・Esc で元に戻す・Tab で読み順の次の要素へ。本文で変わるのはラベルの 1 行)。接続した要素をまとめて Ctrl+C → Ctrl+V すると間の接続も同じ属性で複製される。キャンバスを押すとフォーカスがツールバーのボタンから離れ、Enter でボタンが押し直されない(HTML 版 / VSCode 拡張)
- BLK-owner-20260926-0451-3: ツールバーの「新規」で @canvas の 1 行だけの空の図から始められ(見本の見出し・要素が混ざらない。前の図は ↩ で戻る)、読み込んだ図は「.sb 保存」で同じファイル名で保存される(タブの題名にも出る)
- BLK-junior-20260926-0451-friction: 3 個以上をクリックした順に選ぶと「a → b → c」/ Enter で鎖状に結べ、結んだ直後にラベルを順に打てる。右ボタンのドラッグで block から block へ 1 本結べる。接続 10 本(ラベル 5)がクリック 30・キー 42 → クリック 10・キー 41
- BLK-owner-20260926-0451-1: 入れ子の group を作図 UI だけで組める(親の中で「選択をグループ化」「+ グループ内にブロック追加」・矢印キー/ドラッグ/リサイズで動かしても子は親の内側に収まり、足りなければ親が広がって兄弟は押し出される。ラベルを変えた直後の「+ グループ内にブロック追加」も効く。group の枠をまたぐ配置は警告に出る)
- BLK-primary-20260926-0451: ID の参照元を図を開かずに一覧でき(`npm run check -- --refs <ID> <フォルダ>`、@include 先を含む)、全図の改名を 1 操作でできる(`npm run check -- --rename <旧> <新> <フォルダ>`、VSCode 拡張は F2 / Shift+F12)。変わるのは定義行と接続の from / to だけ
- BLK-owner-20260926-0451-2: 接続のラベルが block の下に隠れなくなった(画面・SVG・PNG・Excel でラベルを block より上に白地で描き、本文に lpos= が無いラベルは block の名前・note・他のラベルを避けた位置に置く。避けきれないと警告に出る)
- BLK-porter-20260926-0451: @include の図を「.sb 読込」で本体と include 先を一緒に選んで開ける(複数選択。include 先は本体からの相対パス、フォルダ情報が無ければ同じ名前)。読めない include はその行に理由を出し、参照する接続・書き出しでも知らせる。VSCode 拡張・npm run check も同じ core で解決する
- BLK-owner-20260926-0451-prune: 線の形の既定を本文の `@canvas` 行の `route=` に持たせた。ツールバー「⌇ 線の形」/ L キーはその 1 行を書き換え(曲線に戻すと消える)、開き直しても・SVG/PNG・検査・VSCode 拡張でも同じ形になる。接続ごとの `route=` が優先
- BLK-owner-20260925-1921-7: ツールバーとプロパティ欄の入口が「何をするか」の名前と動詞のツールチップを持つ(「◎ 未接続を薄く」「PNGをコピー」「透過PNG」「⌇ 線の形: 曲線」、スタイルは 実線/破線/太線、グループ欄は「+ グループ内にブロック追加」)。語彙は core/terms に 1 か所で、VSCode 拡張も同じ意味の英語。README から実在しない mcp-server/・examples/ の案内を消し、ファイル構成を実在に合わせた
- BLK-junior-20260925-1921-friction: 「+ ブロック追加」(ツール欄・group 欄)と貼り付け(Ctrl+V)が、直前に置いた block の右隣の空き位置に置き、大きさ・色を引き継ぐ(group の端・キャンバスの端で折り返し、group は下へ伸ばす)。Ctrl+V を続けて押すと複製が格子に並ぶ。block を選ぶとプロパティ欄の先頭に複製のキーを示す(HTML 版 / VSCode 拡張、置き場所は `core/layout` の placeNext)
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
