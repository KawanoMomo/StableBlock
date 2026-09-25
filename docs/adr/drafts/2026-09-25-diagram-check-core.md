# [DRAFT] 図の検査を core/check に置き、接続の端点計算を core/label に寄せて描画と検査で共用する

- ステータス: ドラフト(未採番。承認後 /adr で正式登録)
- 日付: 2026-09-25
- 起点: BLK-owner-20260925-1921-5(エラー表示が理由を出さず、存在しない ID・重なり・線の横切りを知らせない)

## コンテキスト
エラー表示は parser が読めなかった行の先頭 40 文字を出すだけで、存在しない ID への接続・block の重なり・線が別の block の上を
横切ることは何も知らせなかった。線の横切りを判定するには描画と同じ経路が要るが、端点(ポート)の計算は `stableblock.html` と
`vscode-stableblock/src/extension.js` に同じものが別々にインラインで書かれていた。

## 選択肢
1. 横切りを避ける経路(draw.io の直交経路のような障害物回避)を入れる
2. 経路は今のままにし、横切りを検査して知らせる。検査は描画と同じ点列で行う
3. 検査を HTML 版だけに書く

## 決定
案 2。避ける経路は既存の図の見た目(座標は同じでも線の形)を一斉に変え、Git 差分にも出ない変化になるため別の判断にする。
- `core/label/label-core.mjs` に `getSide / portPos / computePorts / pathPoints / connectionPaths` を置き、HTML 版と拡張の描画はこれを呼ぶ(二重実装をやめる)
- `core/check/check-core.mjs`(import なし、browser 版は `check-core.browser.js`)が診断 `{line, level, msg}` を返す。
  error: 読めない行(理由付き)・存在しない ID への接続。warn: block の重なり・線の横切り・同じ組の 2 本目・group への接続
- `core/check/check-cli.mjs`(`npm run check`)が同じ診断を、図を開かずに複数ファイルへかける。`@include` 先の行は元のファイルと行に戻して示す
- parser 自体(エラー文言を含む)は変えない(`core/dsl` とのドリフト検出を保つ)。理由は検査側が元の行から作る

## 影響
- エラー表示欄は warn だけのとき琥珀色、error を含むとき赤。ステータスバーは `Err: N` と `Warn: N`
- 既存の図にも横切りの warn が出る(手本の spi_swc で 2 件)。`junior-01` はエラー表示欄が出ないことでなく error が無いことを確かめるように変えた
