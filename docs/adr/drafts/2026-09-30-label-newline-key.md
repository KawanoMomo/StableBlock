# [DRAFT] ラベルの改行はどの要素・どの欄でも Shift+Enter にし、欄は本物の改行で見せる

- ステータス: ドラフト(未採番。承認後 /adr で正式登録)
- 日付: 2026-09-30
- 起点: BLK-owner-20260930-0208-2(note は Shift+Enter、block・接続は `\n` を手で打つ。block のその場編集の Shift+Enter は確定になり、続けて打った 2 行目が 1 行目を置き換えた)
- 関連 ECN: ECN-003(ラベル入力中はプロパティ欄を作り直さない)、ECN-009(注釈テキストの改行処理)

## コンテキスト
本文の改行の印は `\n`(バックスラッシュと n)で、block・note・接続(BLK-porter-20260930-0109)は画面・SVG・PNG・Excel で 2 行に描く。
作図 UI の打ち方は要素ごとに違い、note だけが textarea で Shift+Enter、block・group・接続は `<input>` で `\n` を手で打つ(欄にも `\n` の文字が見える)。

## 選択肢
1. どの欄も Shift+Enter(draw.io と同じ)。欄を textarea にして本物の改行で見せ、本文へは `\n` 1 つで書く
2. Alt+Enter(Excel のセルと同じ)。ブラウザ・OS によって Alt が別の働きを持つ。note の既存の打ち方と揃わない
3. `<input>` のまま Shift+Enter で `\n` の 2 文字を差し込む。欄と画面で改行の位置が違って見える

## 決定
案 1。キーの判定は core/select labelEnterKey(Shift+Enter = 改行、Enter = 確定、Ctrl+Enter = 確定して次の兄弟へ)、
欄と本文の行き来は core/label labelFieldText / labelFromField。quoteLabel も本物の改行を `\n` に直す(本文の行を割らない)。
キャンバス上のその場編集・プロパティ欄のラベル欄・接続パネルのラベル欄(結んだ直後の欄を含む)が HTML 版と VSCode 拡張の両方でこれを使う。
group の名前も `\n` で 2 行に描く(Excel・Mermaid の書き出しは元から行を割っていた)。

## 影響
- Enter・Tab・Ctrl+Enter の働きは変えない。本文の書式(`\n`)は変えない
- ラベル欄は textarea(行の数だけ高さ。折り返さない)。テストで欄を `input` として探していた箇所は `#prop-label` / `.conn-label` に直した
- note のテキスト欄の Enter は今まで通り改行
