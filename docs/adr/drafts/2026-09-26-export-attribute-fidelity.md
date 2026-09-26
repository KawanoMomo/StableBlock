# [DRAFT] 書き出しの属性ごとの当て方を parser の属性一覧から検査する

- ステータス: ドラフト(未採番。承認後 /adr で正式登録)
- 日付: 2026-09-26
- 起点: BLK-builder-20260926-1230-1(porter の corpus 17 / 19 / 21 / 22 / 23 / 24 で Excel が属性を知らせ無しに落とした)

## コンテキスト
Excel 書き出し(core/excel/emitter.js)は属性を 1 つずつ拾い、`listXlsxDrops` は「端が図に無い接続」しか知らせなかった。
block の style=bold / dashed、接続の線の形(画面の既定は曲線、Excel は直線)、lpos= が黙って変わった。
Mermaid も lpos=right を書いた接続と round= の大きさを知らせなかった。属性を足すたびに書き出し側の対応が漏れる作りだった。

## 選択肢
1. 見つかった属性ごとに emitter を直す(従来)
2. 書き出しごとに「載せる / 知らせる」の宣言表を置き、listXlsxDrops をその表から作る
3. parser の属性一覧(core/dsl の `ATTRS`)を正とし、全属性について「既定と違う値にすると書き出しの中身か、書き出せなかったものの一覧が変わる」ことを
   unit で確かめる。載せ方・知らせ方は各書き出しの中に書く

## 決定
案 3。`core/dsl/__tests__/export-fidelity.test.mjs` が Excel と Mermaid について検査し、新しい属性は見本の値(SAMPLES)を足さないと赤になる。
画面でも描き分けない属性(note の style=)と、見た目に効かない属性(canvas の grow=、Excel の canvas width/height)だけを理由付きで除外できる。
案 2 は宣言と実装がずれうる(宣言だけ「載せる」にできる)ので採らない。
あわせて block の枠線は `boxLine(item, kind)` で画面(core/render)と同じ太さ・破線・色にし、Excel の直線で表せない線の形と lpos= は一覧で知らせる。

## 影響
- 接続を含む図の Excel 書き出しでは、画面の既定が曲線のため「接続の線の形(曲線 N 本。Excel では直線になる)」がほぼ毎回出る。
  Excel の曲線・直角コネクタ(curvedConnector3 / bentConnector3)で載せれば消える
- `ATTRS` を export した(dsl-core.mjs に browser 版は無いので影響は node 側だけ)
