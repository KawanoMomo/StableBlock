# [DRAFT] Excel の接続線を画面の線の形の既定コネクタで書き出す

- ステータス: ドラフト(未採番。承認後 /adr で正式登録)
- 日付: 2026-09-26
- 起点: BLK-porter-20260926-1205-1(BLK-builder-20260926-1230-2 と同じ穴)

## コンテキスト
画面の接続の既定は曲線(route= / `@canvas` の route=)だが、Excel 書き出しは `straightConnector1` だけで、
接続を含む図ではほぼ毎回「接続の線の形(Excel では直線になる)」が一覧に出ていた。
あわせて Excel 実機(COM)で開くと、図形の id を 1 から振った drawing は Excel が id を振り直し、
`stCxn` / `endCxn` が 1 つずれた図形(接続線自身など)を指していた。

## 選択肢
1. 既定形のコネクタ `curvedConnector3` / `bentConnector3` に、上下の辺で結ぶ線だけ 90° の回転と flip を付ける
2. `custGeom` で画面と同じ 3 次ベジェ・折れ線をそのまま描く
3. 直線のまま一覧で知らせる(従来)

## 決定
案 1。Excel 上で図形を動かしても接着(stCxn / endCxn)に沿って Excel が線を引き直せ、利用者が Excel の「コネクタの種類」で変えられる。
案 2 は形は画面と一致するが、図形を動かしたときに Excel が引き直せない(接続線でなくなる)。
曲線の形は画面の 1 本の 3 次ベジェと少し違う(Excel は中点で縦になる 2 本のベジェ)が、辺に直角に出入りし中点を通る点は同じ。
Excel は 90° 回した図形の anchor を回した後の外接矩形として読むので、anchor は端点の外接矩形、xfrm は回す前の箱で書く。
図形の id は Excel 自身の drawing と同じく 2 から振る。

## 影響
- Excel 書き出し後の一覧から「接続の線の形」が消え、lpos= は接続ごとに要素 ID と値で出る
- golden(core/excel/fixtures/*.expected-drawing.xml)は既定の曲線と id の振り方に合わせて更新した
