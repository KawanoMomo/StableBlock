# [DRAFT] DSL の parse / 直列化を core/dsl に置き、HTML 版の parseDSL とはドリフト検出テストでつなぐ

- ステータス: ドラフト(未採番。承認後 /adr で正式登録)
- 日付: 2026-09-25
- 起点: BLK-human-20260925-1900(E2E 基盤とコーパス往復テスト)

## コンテキスト
コーパス往復テスト(porter の全 .sb を「parseDSL → 直列化」してバイト一致)を node --test で回すには、Node から呼べる parseDSL と
直列化が要る。parseDSL は `stableblock.html` と `vscode-stableblock/src/extension.js` にインラインで重複しており、直列化はどこにも無い
(GUI は DSL テキストそのものを正本として正規表現で書き換える)。

## 選択肢
1. テストが `stableblock.html` から parseDSL を切り出して使い、直列化はテスト側に書く
2. `core/dsl/dsl-core.mjs` に parseDSL と serializeDSL を置き、HTML 版は今は触らず、HTML の parseDSL と結果が同じことを unit で検出する
3. 2 に加えて HTML 版・拡張を `core/dsl` の browser build(label-core と同じ方式)に切り替える

## 決定
案 2。直列化は「parser が読んだ値」を元の行の空白・コメント・空行・改行コード・BOM に並べ直す方式(行ごとのテンプレート)。
parser が読まずに捨てたトークン(未知の属性・不正な lpos など)は直列化で落ちるので、往復のバイト差分として黙った欠落が見える。
案 3 は GUI の描画経路(critical path)を替えるので、E2E の土台ができた後に別 BLK で行う。

## 影響
- `core/dsl/__tests__/dsl-core.test.mjs` が `stableblock.html` の parseDSL を取り出して結果を突き合わせる。HTML の parser を変えたら
  `core/dsl/dsl-core.mjs` も同じに直さないと unit が赤になる
- 拡張(`extension.js`)の parseDSL は対象外のまま(HTML 版と差がある場合は別 BLK)
