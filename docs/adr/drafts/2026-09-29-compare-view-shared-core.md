# [DRAFT] 2 つの図の見比べは core/render の marks と core/diff の行差分欄を HTML 版・拡張で共有する

- ステータス: ドラフト(未採番。承認後 /adr で正式登録)
- 日付: 2026-09-29
- 起点: BLK-primary-20260929-0005-wish(ブラウザ版に過去の版と今の版を並べて見比べる手段が無い)

## コンテキスト
VSCode 拡張の Visual Diff は core/diff の diffModel(行差分と変わった要素の印)を使うが、左右の絵は webview に埋め込んだ独自の
簡易パーサと簡易描画(renderMiniSVG)で描いていた。HTML 版に同じ見比べを入れると、描画が 3 通り(画面・拡張の差分・HTML の差分)に分かれる。

## 選択肢
1. HTML 版にも簡易描画を持たせる(拡張の renderMiniSVG を写す)
2. core/render の renderSvg に view の `marks`(変わった要素・接続)を足し、行差分の欄は core/diff の diffLinesHtml にする。
   拡張は webview に描画コードを持たず、拡張ホストで core/dsl の parseDSL・renderSvg・diffLinesHtml を呼んで SVG / HTML を渡す
3. 2 と同じだが、拡張の webview に render-core・label-core・dsl-core を inline して描く

## 決定
案 2。理由: (a) 画面と同じ描画(接続の経路・ラベル・注釈・include 先)で見比べられ、簡易描画とのずれが無い
(b) dsl-core は label-core / check-core を import するので webview への inline(案 3)は包みが要る。拡張ホストなら loadCore でそのまま読める
(c) 印は view の状態なので書き出し(exportSvg)には入らない(既存の「書き出しは本文だけで決まる」を保つ)。

## 影響
- 拡張の VSIX に core/dsl/dsl-core.mjs を同梱する(scripts/prepackage-core.js)
- HTML 版は core/diff/diff-core.browser.js(window.StableBlockDiff)を読む。入口はステータスバーの図名の一覧の「今の図と比べる」だけ(ボタン・タブは増やさない)
