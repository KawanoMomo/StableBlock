# [DRAFT] Visual Diff は比較相手の版を Git の履歴から選び、差分の計算は core/diff に置く

- ステータス: ドラフト(未採番。承認後 /adr で正式登録)
- 日付: 2026-09-27
- 起点: BLK-primary-20260926-1605-wish(図の変更履歴が GUI に無く、過去の版はターミナルの git log / diff でしか見られない)

## コンテキスト
VSCode 拡張の「Visual Diff」(`stableblock.diffPreview`)は比較相手が `git show HEAD:{ファイル名}` 固定で、過去の版を選べなかった
(しかもパスをリポジトリ直下からでなくファイル名だけで渡すため、サブフォルダの .sb では HEAD も読めなかった)。
owner の判断は「新しい画面・ボタン・タブは増やさず、既存のコマンドの比較相手を選べるようにする。履歴の保管は Git が持つ」。

## 選択肢
1. 図ごとの「変更履歴」パネルを新設する — 新しい画面が増える。owner が却下
2. 既存コマンドで `git log --follow` の版を QuickPick に出し、選んだ版と今の本文を並べる(選ばず Enter は最新の版 = 今までと同じ)
3. HTML 版にも入口を足す — file:// では git を読めない

## 決定
案 2。git の出力の読み取り・行差分(LCS)・変わった要素の印・見出しは純粋関数として `core/diff/diff-core.mjs` に置き、node --test で守る。
git の実行と include 先の読み込みは拡張ホスト(選んだ版の include 先は `git show {版}:{パス}`、今の本文は拡張が読んだファイル)。
行差分は .sb の本文(正本)をそのまま比べ、座標の行も除かない。絵は @include を展開した本文で描く。

## 影響
- `vscode-stableblock/scripts/prepackage-core.js` の同梱物に `core/diff/diff-core.mjs` が増える
- コマンド名は「Visual Diff with a Git Version」(入口は同じ 1 つ)
