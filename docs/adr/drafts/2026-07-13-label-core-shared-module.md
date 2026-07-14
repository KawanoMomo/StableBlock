# [DRAFT] 接続線ラベルロジックの共有モジュール core/label 新設

- ステータス: ドラフト(未採番。承認後 /adr で正式登録)
- 日付: 2026-07-13

## コンテキスト
接続線ラベルの位置計算・DSL書き戻しは HTML版と VSCode拡張 Webview の両方で必要。
両実装はコピー型アーキテクチャで、二重実装はズレ(ドリフト)の温床になる。

## 選択肢
1. 両実装にロジックを重複実装(現状のコピー型を踏襲)
2. core/label/ に純粋関数 ESM を置き、core/excel と同じ browser build + 実行時注入で共有

## 決定
案2。理由: (a) node --test で単体テスト可能になる (b) 幾何計算のドリフトを構造的に防げる
(c) core/excel で確立済みのパターン(build-browser.mjs + ドリフト検出テスト)を再利用でき
新規インフラ投資が不要。レンダラ・UI層の共通化はスコープ外のまま(ADR対象外)。

## 影響
- stableblock.html は core/label/label-core.browser.js への <script src> 依存が増える
  (Excel エクスポートで既に sibling ファイル依存があり、単一ファイル性は既に失われている)
- vsce パッケージング: extension.js は実行時に REPO_ROOT から読むため core/excel と同条件
- **[2026-07-14 追記]** label-core は core/excel(Excelエクスポート機能、任意操作)と異なり
  **critical path 依存**: Webview の `parseDSL` が接続行ごとに `window.StableBlockLabel.parseLpos`
  を呼ぶため、読込失敗(=undefined)は接続線の描画そのものを停止させる(接続線全滅)。
  VSIXには `core/` が同梱されないため、インストール済み拡張(`code --install-extension`)では
  従来の `REPO_ROOT = path.resolve(__dirname,'..','..')` 固定解決が必ず失敗していた
  (全ブランチレビューで Critical 指摘、`feature/connection-label-position` で修正)。
  対策: `vscode-stableblock/scripts/prepackage-core.js` が `vsce package` 前(`vscode:prepublish`
  フック)に `core/label/label-core.mjs` ・ `core/excel/emitter.js` ・ `core/excel/jszip.min.js` ・
  `core/excel/template-skeleton/` を `vscode-stableblock/core/` へコピーして同梱し、
  `extension.js` 側の `REPO_ROOT` 解決もリポジトリ内レイアウト/VSIX同梱レイアウトの
  候補パス方式(`fs.existsSync` 判定)に変更した。
- **[2026-07-14 追記2: 辺選択ロジックの3箇所目の複製]** Obsidian Canvas エクスポート
  (`feature/jsoncanvas-export`)の `core/canvas/emitter.mjs` に `chooseSides()` を新設した。
  これは既存の `getSide()`(stableblock.html)/`gSide()`(extension.js Webview)と同一の
  ギャップ比較式の**意図的な3箇所目の複製**(約10行、spec §2 で決定)。
  Canvas 側にポート按分の表現手段がないため cPorts 相当は移植していない。
  将来この辺選択ロジックを core/label(または core/geometry)へ統合し、
  3実装が同一関数を参照する形にする選択肢を残す(採番時の検討事項)。
