# Obsidian Canvas(JSON Canvas 1.0)エクスポート 設計スペック

- **日付**: 2026-07-14
- **ステータス**: レビュー待ち
- **対象**: `core/canvas/`(新設)、`stableblock.html`(HTML版)、`vscode-stableblock/src/extension.js`(VSCode拡張)
- **前提調査**: StableBlock→JSON Canvas 変換の実現性調査(2026-07-14、実現性=中〜高)

## 背景 / 目的

Obsidian の Canvas 機能(オープン仕様 [JSON Canvas 1.0](https://jsoncanvas.org/spec/1.0/)、拡張子 `.canvas`)へ StableBlock の図をエクスポートし、Obsidian 上でノートと図を組み合わせた運用を可能にする。

## 決定事項(ユーザー確認済み)

| 論点 | 決定 |
|---|---|
| ターゲット仕様 | **標準 JSON Canvas 1.0 のみ**。Advanced Canvas プラグインの拡張属性は出力しない |
| UI範囲 | **HTML版+VSCode拡張の両方** |
| note(注釈レイヤー) | **表示状態に従う(WYSIWYG)**。注釈レイヤー表示中のみ note と注釈接続を出力(SVG/PNGエクスポートと同じ直感) |

## 1. 共有エミッタ `core/canvas/emitter.mjs`(新設)

`buildCanvas(parsed, opts)` — パース済みオブジェクトから JSON Canvas 1.0 準拠のオブジェクトを返す**純粋関数**(DOM API 使用禁止、node --test で検証)。

- 入力: `parsed`(parseDSL の返却値: canvas/blocks/groups/notes/connections/blockMap)、`opts = { showAnnotations: boolean, scale?: number }`
- 出力: `{ nodes: [...], edges: [...] }`(JSON Canvas 1.0 トップレベル構造)
- 座標系: 両者ともピクセル・左上原点。グリッド座標 × `parsed.canvas.grid` × **scale(既定2)** で変換
- **scale の根拠(2026-07-14 実測)**: Obsidian は既定 Markdown フォント(~16px)で text ノードを描画し、ノード単位のフォント指定は仕様に存在しない。1x では長め日本語2行ラベル(160×60px)が +13px はみ出すことを DOM 実測で確認。2x でテキストは -71px の余裕、グループ名の枠外張り出し(~31px 固定)も標準配置(上に1グリッド=2xで40px)で回避できる。Canvas はズーム自在のため絶対サイズ拡大の副作用はない。UIからの変更手段は設けない(opts のみ)

### マッピング

| StableBlock | JSON Canvas | 変換規則 |
|---|---|---|
| block | `{id, type:"text", text, x, y, width, height, color}` | text=label(リテラル `\\n` → 実改行)、color=HEXパススルー |
| group | `{id, type:"group", label, x, y, width, height, color}` | メンバーシップは両者とも空間包含のため座標のみで成立。color=HEXパススルー |
| note | `{id, type:"text", text, x, y, width, height, color}` | **showAnnotations=true のときのみ**。text=label(`\\n`→実改行) |
| connection(通常) | `{id, fromNode, fromSide, toNode, toSide, color, label?}` | 常に出力。fromSide/toSide は §2 の辺選択。label は空文字なら省略 |
| connection(注釈) | 同上 | **showAnnotations=true のときのみ**(注釈接続の判定は既存 `isAnnotationConn` と同一基準) |
| 双方向 `-->` | `fromEnd:"arrow"` を付加 | toEnd はデフォルト(arrow)のため省略。単方向は fromEnd/toEnd とも省略 |

- **from/to のいずれかが存在しないIDを参照する接続は出力しない**(現行レンダラが描画しないのと同じ扱い)
- ノードIDは StableBlock の id をそのまま流用。エッジIDは `e-<from>-<to>-<出力順連番>`
- 出力順: groups → blocks → notes(nodes 配列)、通常接続 → 注釈接続(edges 配列)。Canvas の z-order は配列順に依存しないが、決定的な出力で golden テストを安定させる

### 変換で失われる情報(仕様として明記、変換時に警告等は出さない)

JSON Canvas 1.0 に対応フィールドが存在しないため、以下は**黙って捨てる**:

- 接続線の `style`(破線)・`width`(太さ)・`route`(curved/straight/ortho — Canvas は常時自動ベジェ)・`lpos`(エッジラベルは中央固定)
- 同一辺上の複数接続のポート按分位置(Canvas は辺単位のみ)
- block/note の `textColor`・`borderColor`・`round`・`style`(dashed/bold)
- 色の意味論差: StableBlock の color は塗り潰し、Canvas の color は枠線アクセント寄りにレンダリングされる(値は正確に渡すが見た目は変わる)
- **グループ名の表示位置**: Obsidian はグループ名を枠の外側上部(~31px、フォント由来の固定高)に表示し、JSON Canvas に位置制御フィールドはない(枠内表示は不可能)。scale=2 では上に1グリッドの隙間がある標準配置でかぶりを回避できるが、**上隙間ゼロの配置では上のグループ/ノードにかぶる**(既知の制限)。運用ガイド: グループの上は1グリッド以上空ける
- テキスト/グループ名のフォントサイズ調整は vault 全体の CSS スニペット(`.canvas-node-container` / `.canvas-group-label`)でのみ可能(本機能からは関与しない)

## 2. 辺選択(fromSide/toSide)

既存レンダラの `gSide`/`getSide`(2ブロックの上下左右ギャップ比較で fs/ts を決める約10行のロジック)と**同一式**を emitter 内に実装する。語彙(top/bottom/left/right)は JSON Canvas の side 値と一致。

- ポート按分(cPorts の idx/total 計算)は Canvas では表現不可能なため移植しない
- 意図的な小さい二重実装(3箇所目)。将来 `core/label` へ統合する選択肢を ADR ドラフト補記に残す

## 3. browser build とドリフト検出

- `core/excel/build-browser.mjs` に canvas emitter の出力を追加: `core/canvas/emitter.browser.js`(`window.StableBlockCanvas = { buildCanvas, ... }`)
- ドリフト検出テストを `build-browser.test.mjs` に追加(**label-core と同じ改行正規化付き** — autocrlf 環境の既知問題対策)

## 4. HTML版 UI

- ツールバーの Mermaid ボタンの隣に「Canvas」ボタンを追加
- `exportCanvas()`: `buildCanvas(parsed, { showAnnotations })` → `JSON.stringify(obj, null, "\t")`(タブインデント、Obsidian 生成ファイルと同様)→ 既存 `download()` で `diagram.canvas` 保存
- `<script src="core/canvas/emitter.browser.js">` を label-core の隣に追加

## 5. VSCode拡張 UI

- Webview ツールバーにボタン追加。保存フローは既存エクスポートと同型: webview 側 `vscodeApi.postMessage({type:'exportCanvas', data:<JSON文字列>})` → host 側 `showSaveDialog({ filters: { "Canvas": ["canvas"] }, defaultUri: diagram.canvas })` + `workspace.fs.writeFile`(既存の exportSVG/exportMermaid ハンドラと同じ構造)
- emitter の注入は label-core と同じ「実行時読込 + export 剥がし + window グローバル公開」パターン
- **`vscode-stableblock/scripts/prepackage-core.js` の ASSETS に `core/canvas/emitter.mjs` を追加**(VSIX 同梱。PR #14 の Critical の再発防止)
- Webview 内コードはテンプレートリテラル規約(バッククォート・`${}` 禁止、`\\n` 二重エスケープ)に従う

## 6. 検証方針

- **単体テスト**(node --test、`core/canvas/__tests__/`): 座標変換、`\\n`→改行、WYSIWYG分岐(showAnnotations true/false)、双方向 `fromEnd`、辺選択の4方位、欠損ID接続の除外、ラベル省略、golden JSON(代表図の完全一致)
- **実機検証**: 出力 `.canvas` を実際の Obsidian vault で開いて表示確認。`obsidian-cli` スキルによる自動オープン+スクリーンショットが可能かを実装計画で確認し、不可ならユーザー受入項目とする(visual verification gate)
- HTML版はブラウザ実機で「Canvas」ボタン→ダウンロード→JSON 構造確認(Playwright、ローカルHTTPサーバー経由 — file:// はブロックされる既知事項)

## 7. スコープ外(将来拡張)

- 逆変換(Canvas → StableBlock DSL)
- Advanced Canvas プラグインの拡張属性(破線等)
- `file`/`link` ノード種別の生成
- MCPサーバーへの組み込み(`mcp-server/` は未マージブランチのみに存在)

## QAログ(推奨案で先行決定した非クリティカル論点)

| # | 論点 | 決定 | 理由 |
|---|---|---|---|
| 1 | ノードID | 元の StableBlock id を流用 | 仕様上ユニーク文字列なら可。可読・安定 |
| 2 | エッジID | `e-<from>-<to>-<連番>` | 決定的でユニーク |
| 3 | 色 | HEXパススルー | 仕様がHEX許容(`"#FF0000"`)。プリセット"1"〜"6"への丸めはしない |
| 4 | ファイル名 | `diagram.canvas` | 既存エクスポートの `diagram.*` 慣例 |
| 5 | 辺選択 | gSide と同一式を emitter 内に実装 | 約10行。ポート按分は Canvas 側に表現手段がなく不要 |
| 6 | JSON整形 | タブインデント | Obsidian 生成ファイルと同様で diff フレンドリー |
| 7 | 単方向矢印 | 属性省略(toEnd デフォルト) | 仕様のデフォルト挙動に一致 |
| 8 | 空ラベル | edge の label キー自体を省略 | 不要キーを出さない |

## 参考(一次情報)

- JSON Canvas 1.0 仕様: https://jsoncanvas.org/spec/1.0/ / https://github.com/obsidianmd/jsoncanvas
- Obsidian Canvas ヘルプ・フォーラム(エッジ直線化不可・ラベル位置固定・node color の意味論)
- 実現性調査レポート(2026-07-14、セッション内 Sonnet 調査)
