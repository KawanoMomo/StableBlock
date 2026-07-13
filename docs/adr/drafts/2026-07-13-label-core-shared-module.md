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
