# [DRAFT] 図全体の既定の線の形は `@canvas` 行の route= に持たせ、ツールバーの「線の形」は本文を書き換える入口にする

- ステータス: ドラフト(未採番。承認後 /adr で正式登録)
- 日付: 2026-09-26
- 起点: BLK-owner-20260926-0451-prune(線の形の既定を本文に持たせ、接続ごとの「経路」と 1 つの仕組みに統合する)

## コンテキスト
接続の形を決める仕組みが 2 つあった。(1) 接続行の `route=`(接続パネルの「経路」)と、(2) ツールバー「⌇ 線の形」と L キーが切り替える
HTML 版だけの表示状態 `lineMode`。(2) は本文にも localStorage にも残らず、同じ .sb でも押した回数で画面・SVG・PNG の線の形と
横切りの警告が変わり、開き直すと曲線に戻った。VSCode 拡張は `route=` を読まず常に曲線、`npm run check` は常に曲線で検査していた。

## 選択肢
1. (2) を削除し、接続ごとの `route=` だけにする(図全体を直線にするには全接続行に書く。差分が接続の本数だけ出る)
2. (2) の状態を localStorage に保存する(本文に無い状態のまま。別の PC・拡張・CLI・書き出しで食い違う)
3. 図全体の既定を `@canvas` 行の `route=`(curved / straight / ortho)として本文に持たせ、(2) の入口はその 1 行を書き換える

## 決定
案 3。線の形は「接続の `route=` → `@canvas` の `route=` → 曲線」の順で決まり、GUI はこの 2 つ以外に線の形の状態を持たない。
曲線に戻すと `route=` を消すので、何も書いていない既存の図は今と同じ曲線で描かれ、1 往復で元のバイトに戻る。
`@canvas` 行が無い図で直線・直角を選ぶと、先頭のコメントの後に `@canvas route=...` を 1 行足す。
決め方と path の組み立ては `core/label`(`canvasRoute` / `connRoute` / `nextCanvasRoute` / `connPathInfo`)、`@canvas` 行の書換は
`core/layout`(`setCanvasRouteInDsl`)に置き、HTML 版・VSCode 拡張・`npm run check`(`connectionPaths`)が同じ関数を使う。

## 影響
- ボタンの表示(曲線 / 直線 / 直角)は本文の `@canvas` 行から毎回描き直す。本文欄で `route=` を書き換えても追従する
- 押す・L キーは元に戻す(Ctrl+Z)の対象になる
- Excel は従来どおり直線のコネクタで出す(線の形を表す手段を持たない)。Mermaid への書き出しは `@canvas` の `route=` も落ちた本数に数える
