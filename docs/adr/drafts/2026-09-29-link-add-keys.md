# [DRAFT] 選んだ block から「つないで追加」する入口はキー(Tab / Ctrl+Enter)にし、置き場所は列で決める

- ステータス: ドラフト(未採番。承認後 /adr で正式登録)
- 日付: 2026-09-29
- 起点: BLK-junior-20260925-1921-friction(作図 UI だけで block と接続を置く手数。ECN-016 の仮 ID、ECN-018 の 2 ブロック選択の接続)

## コンテキスト
作図 UI だけで図を描くと、1 個ごとに「+ ブロック追加 → 名前 → 選択解除」、1 本ごとに「2 つ選ぶ → Enter」を繰り返していた
(データフロー図 block 3・接続 2 本でクリック 16、配置図 ECU + バス 12・接続 12 本でクリック約 94)。
「+ ブロック追加」は何かを選んでいる間は出ず、足した block は接続と無関係な位置(右隣)に並ぶ。

## 選択肢
1. 新しいボタン(「つないで追加」)をプロパティ欄に足す(原則「新しいボタンを増やす前に既存の入口を直す」に反する)
2. draw.io の Alt+Shift+矢印(複製してつなぐ)。向きは選べるが、同じ元から続けて足す(扇形)に向かない
3. マインドマップ(XMind・MindManager)の Tab = 子、Enter = 兄弟。Enter は既にラベルのその場編集なので兄弟は Ctrl+Enter

## 決定
案 3。block を 1 つ選んだ図の上で Tab は「選んだ block → 新しい block」、Ctrl+Enter(⌘+Enter)は「選んだ block へ入る接続の元 → 新しい block」
(元が無ければ接続なし)。新しい block は選んだ block と同じ大きさ・色で、置いたらそのままラベルのその場編集に入る(名前を打って Enter。
その場編集中の Ctrl+Enter は確定して次の兄弟へ)。置き場所は core/layout placeBeside の 1 規則: Tab は右に 2 グリッド空けた列の上端から下へ、
Ctrl+Enter は同じ列の下へ(列は横へずらさない)。group の中の block からなら同じ group に入り、足りなければ group が広がる(growGroupFor)。
キーの判定は core/select linkAddKey、入る接続の元は core/label linkSources(HTML 版と VSCode 拡張で共用)。

## 影響
- 欄で打っている間、Shift+Tab、ツールバー等のボタンにフォーカスがあるときの Tab はブラウザのまま(フォーカス移動)
- 本文の差分は定義行と接続行だけ(group が広がるときはその group の行と、押し出された要素の行)。Ctrl+Z 1 回で戻る
- 1 つの元から多数(10 本超)を右の列に並べると、下の方の線は上下の辺で結ばれ(core/label getSide)、列の上の block を横切る警告が出る。
  経路の規則(辺の選び方)は既存の図の絵を変えるため、ここでは変えない
- 足した block の名前を打っている間の Tab は「確定して同じ向きに次の block を足す」(Tab → 名前 → Tab → 名前 → Enter で鎖。XMind・MindManager と同じ)。
  既存の block をダブルクリック・F2 で始めた編集の Tab は読み順の次へ移るまま(core/select inlineTabAction)。移った先は見える所までスクロールし、
  移る先が無ければ編集を続ける(確定すると、続けて打った文字が選んだままの block のラベルを書き換える)(BLK-owner-20260929-2209-1)
