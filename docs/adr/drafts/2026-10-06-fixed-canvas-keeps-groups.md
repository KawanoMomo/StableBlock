# [DRAFT] 「はみ出したら自動で広げる」を外した図(grow=off)では、group に足しても group を広げない

- ステータス: ドラフト(未採番。承認後 /adr で正式登録)
- 日付: 2026-10-06
- 起点: BLK-human-20261006-1955-1(チェックを外しても、group 内にブロックを追加すると group が広がって表示がずれる)

## コンテキスト
ツール欄の「はみ出したら自動で広げる」は `@canvas` 行の grow=off を書き、キャンバスの寸法だけを固定していた。
「+ 中にブロック」・group 内への貼り付け(core/layout `placeInGroupFit`)と「つないで追加」(`placeBesideFit`)は、入り切らない
block のために group を広げ、広がった group が掛かる要素を押し出していた(`fitParents`)。資料の寸法に合わせて固定した図でも
group の枠と周りの配置が動くので、利用者はチェックで「自動で広がるもの全部」を止めたつもりでいた。

## 選択肢
1. group ごとの属性(`group ... grow=off`)とプロパティ欄のチェックを足す(DSL の書式が増え、図全体を固定したい人は group の数だけ外す)
2. キャンバスの grow=off を「GUI の追加で枠を自動で広げない」の意味に広げ、group への追加にも効かせる(DSL は変えない)

## 決定
案 2。grow=off の図では `placeInGroupFit` / `placeBesideFit` に `{ grow: false }` を渡し、group の寸法も周りの要素も変えない
(changes は空)。group の内側に空きがあればそこに置き、無ければ「+ 中にブロック」は group の列のまま下へ(group の外の要素にも重ねず)、
「つないで追加」は右の列が収まらなければ下、どちらも収まらなければ右に置く。group の外へ出た block は枠をまたげば警告に出し、出切れば追加直後の選択のまま見せる。group を広げるかは人が決める。
ドラッグ・寸法変更で子が親をはみ出したときの親の広がり(`growParents`)は対象外(利用者が自分で動かした結果で、表示がずれる苦情ではない)。
HTML 版と VSCode 拡張は同じ core/layout を呼ぶ。チェックの説明(title)にも group を広げないことを書く。

## 影響
- `placeInGroupFit(items, gr, w, h, prev, margin, opts)` / `placeBesideFit(..., opts)` に `opts.grow`(既定 true で従来どおり)
- grow=on(既定)の図の挙動は変わらない
