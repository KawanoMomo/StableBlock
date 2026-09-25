# [DRAFT] Mermaid 書き出しを core/mermaid に 1 本化し、表せないものを利用者に知らせる

- ステータス: ドラフト(未採番。承認後 /adr で正式登録)
- 日付: 2026-09-25
- 起点: BLK-owner-20260925-1921-6(書き出しで情報が黙って落ちる)

## コンテキスト
Mermaid 書き出しが HTML 版(`graph TD`、空の group と note・色・note との接続を捨てる)と VSCode 拡張(`flowchart TD`、group の子を二重に書く)で
別々に実装され、どちらも落とした情報を利用者に知らせなかった。porter の人物像は「1 枚でも情報が黙って落ちるなら勧めない」。

## 選択肢
1. 各実装の exportMermaid をそれぞれ直す
2. `core/mermaid/mermaid-core.mjs` に純粋関数 `toMermaid(parsed) → { text, dropped }` を置き、両実装はそれを呼んで結果を保存・表示するだけにする
3. 2 に加えて Mermaid の取り込み(.mmd → .sb)も同じ場所に置く

## 決定
案 2。書き出しの規則(何をどう写し、何を落とすか)は 1 か所で node --test に守らせる。取り込み(案 3)は別の BLK で扱う。
- note は Mermaid に注釈の概念が無いので旗形のノード(`id>"…"]`)で写し、note とつなぐ接続は点線にする
- 色・枠・文字色・破線/太線は `style`、接続の色と太さは `linkStyle` で写す
- 存在しない ID への接続は書かない(Mermaid はノードを勝手に作るため)。座標・大きさ、route= / lpos=、使えない ID の置換は `dropped` に 1 行ずつ積み、
  HTML 版は右下の通知(クリックで閉じる)、VSCode 拡張は警告メッセージで示す
- Excel は `listXlsxDrops(ast)` で同じ形の一覧を返し、同じ通知に出す

## 影響
- HTML 版の出力が `graph TD` から `flowchart TD` に変わり、style / linkStyle 行が増える
- 書き出すたびに「座標・大きさ(自動配置になる)」が通知に出る(Mermaid の性質として必ず落ちるため)
