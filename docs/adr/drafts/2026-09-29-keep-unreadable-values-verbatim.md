# [DRAFT] 取れない属性値は描く値だけ既定に倒し、本文の値は書いたまま往復する

- ステータス: ドラフト(未採番。承認後 /adr で正式登録)
- 日付: 2026-09-29
- 起点: BLK-porter-20260929-0511(corpus 76 `lpos=diagonal` が core の往復で `lpos=right` に変わる)

## コンテキスト
core/dsl の serializeDSL は「parser が読んだ値」を元の空白で並べ直す。style= / route= は読んだ生の値を持つので往復するが、
lpos= は core/label の parseLpos で right に丸めて持つため、無変更でも本文が変わった。数の属性(round= / 接続の width= /
@canvas の width・height・grid=)は数字で始まらない値を parser が読まず、往復でトークンごと消え、警告も出なかった。

## 選択肢
1. 接続の lpos を生の値で持ち、描画・Excel・Mermaid・プロパティ欄の各所で既定に倒す(style / route と同じ持ち方)
2. item の値は今どおり(描く値)にし、serializeDSL の行テンプレートが取れない値のトークンを { key, raw, val } で覚え、
   item[key] が読んだ時の値のままなら raw を書き戻す
3. すべての値で raw を書き戻す(数値の正規化 01 → 1 も隠す)

## 決定
案 2。理由: (a) c.lpos を読む所は描画・Excel・Mermaid・HTML と拡張のプロパティ欄に散っており、案 1 は全部に既定への倒しを足す必要がある。
案 2 は core/dsl だけで閉じ、HTML 版・拡張の parseDSL とのドリフト検査も変わらない (b)「取れない値」の判定は画面の警告と同じ
core/check の badAttrValues を使うので、警告が出る値と書いたまま残る値が一致する (c) 案 3 はコーパス往復が「parser の正規化」を
見つける役目(dsl-core のヘッダ)を失うので取らない。

## 影響
- badAttrValues に数の属性(NUM_VALUES)を足した。値の先頭の数字を読む parser に合わせ「既定の 4 で描く」「8 で描く」と実際に描く値を言う
- 取れない値を GUI やコードで別の値に変えたときだけ serializeDSL は新しい値を書く
