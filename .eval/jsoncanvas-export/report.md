# Obsidian Canvas エクスポート 実機検証レポート

## 総合判定: PASS(HTML版=全項目PASS、Obsidian=構造round-trip実証。目視1点のみ軽受入)

- 実行日時: 2026-07-14
- 検証者: コントローラー(Playwright MCP + Obsidian CLI)
- 検証URL: http://localhost:8932/stableblock.html(Playwright MCP は file:// をブロックするためローカルHTTPサーバー経由)
- Obsidian: 1.12.7、vault=E:\00_Git\docs\wiki

## HTML版(Playwright実機) — 全項目PASS

検証DSL: block×3(日本語・`\n`改行含む)+ group + note + 接続4本(ラベル+lpos付き / 双方向 / 注釈接続 / 欠損ID)

| # | 項目 | 結果 | 観測値 |
|---|---|---|---|
| 1 | コンソールエラーなし | PASS | favicon.ico 404(既知・無害)のみ |
| 2 | Canvas ボタン表示 | PASS | ツールバーに「Canvas」(exportCanvas() 配線) |
| 3 | canvasJson が有効な JSON Canvas を返す | PASS | デフォルトサンプル: nodes=12(=groups+blocks)、edges=6(=接続数)。タブインデント確認 |
| 4 | WYSIWYG分岐 | PASS | showAnnotations=false: nodes=[g1,a,b,c]・edges=2(注釈接続と欠損ID接続を除外) / true: memo ノードと e-memo-a-2 が追加 |
| 5 | 変換の正確性 | PASS | `A\\n日本語`→実改行、双方向=fromEnd:"arrow"、空ラベル=labelキー省略、lpos=topは黙って落ちる(仕様)、辺選択 right/left・top/bottom、色HEXパススルー、座標=grid×20 |

証拠: `canvas-export-html.png`、`sample.canvas`(出力そのもの)

## Obsidian 実機 — 構造round-trip PASS

1. `sample.canvas` を vault(E:\00_Git\docs\wiki)に `stableblock-canvas-test.canvas` として配置
2. `obsidian open path=stableblock-canvas-test.canvas` で正常オープン(rc=0、dev:errors=No errors captured)
3. **Obsidian が自前のシリアライザでファイルを書き直し(1220→894バイト、フォーマットのみ変更)、全5ノード+全3エッジの内容(日本語ラベル・`\n`改行・HEX色・fromSide/toSide・エッジラベル・fromEnd:"arrow")が無傷で保持された** — Obsidian のパーサ/レンダラが本エクスポートを完全に受理した構造的証拠

証拠: `obsidian-roundtrip.canvas`(Obsidian書き直し後のファイル)

### 制限事項

- `obsidian dev:screenshot` が rc=127 で動作せず(CLI側の制約、3回試行)、ピクセルレベルのスクリーンショットは未取得
- **軽受入項目**: vault に開いたままの `stableblock-canvas-test.canvas` タブを一瞥し、ノード・グループ・矢印・ラベルの見た目を確認してください(確認後、テストファイルは削除可)

## 特記事項

- Obsidian の Canvas は保存時にファイルを自動的に書き直すため、StableBlock からの再エクスポートで上書き運用する場合は「Obsidian側での編集は失われる」ことに注意(既知の一方向変換仕様、スペック§7どおり)
