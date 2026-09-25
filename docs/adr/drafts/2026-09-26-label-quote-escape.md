# [DRAFT] ラベル中の二重引用符は `\"` で書き、全パーサと GUI の書き込みが core/label の同じ規則を使う

- ステータス: ドラフト(未採番。承認後 /adr で正式登録)
- 日付: 2026-09-26
- 課題: BLK-porter-20260926-0617(ラベルに二重引用符を含む block が「.sb 読込」で消える)
- 関連 ECN: ECN-002(空ラベルでブロックが消えた。パーサと updatePos / updateSize / updateLabel を同時に直した同じ種類の不具合)

## コンテキスト
ラベルの正規表現が `"([^"]*)"` だったため、`"Block \"quoted\" label"` の行はどの形にも当たらず、block ごと描かれなかった。
GUI のラベル欄で `"` を打つと本文にそのまま入り、同じ理由で block が消えた(接続のラベルは `"` を黙って取り除いていた)。
パーサは core/dsl・HTML 版・VSCode 拡張(Webview と差分表示)に別々にある。

## 選択肢
1. `\"` を `"` の表記にする(C / JSON / PlantUML と同じ)。ほかの `\` は今まで通りそのまま(`\n` は改行の印)
2. `""` を `"` の表記にする(CSV 流)。既存の空ラベル `""` と見分けにくい
3. 全角の `”` に置き換える。書き出しで元の文字に戻せない

## 決定
案 1。形は `"((?:\\"|[^"])*)"`、値は unquoteLabel(`\"` → `"`)、書き込みは quoteLabel(`"` → `\"`)。どちらも core/label の純粋関数で、
core/dsl の parse / serialize、HTML 版の parseDSL と updatePos / updateSize / updateLabel、VSCode 拡張の Webview の parseDSL と upP / upS / upLb、
差分表示の parseDSL、setConnLabelInDsl が同じ規則を使う。末尾が `\` のラベル(`"C:\"`)は後戻りで閉じ引用符として読めるので、既存の図の意味は変わらない。
無変更保存のバイト一致は serializeDSL が `"` を `\"` に戻すことで保つ。

## 影響
- 接続のラベルに `"` を打つと、取り除かずに `\"` で残る
- core/dsl のドリフト検出に VSCode 拡張の Webview のパーサも加えた(getWebviewContent の出力から取り出して core と比べる)
