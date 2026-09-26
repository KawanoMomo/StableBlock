# [DRAFT] @include は読込で選んだファイル(拡張・CLI はファイル)から core/check で展開し、読めない include を黙って落とさない

- ステータス: ドラフト(未採番。承認後 /adr で正式登録)
- 日付: 2026-09-26
- 起点: BLK-porter-20260926-0451(@include で参照した先の block が GUI の Import では解決されず欠落する)。ECN-026 の 7(@include と preprocessInclude)を置き換える

## コンテキスト
HTML 版の `preprocessInclude()` は include 先を**ページ(stableblock.html)の場所からの相対**で fetch し、読めないと `# include error` という
コメント行に置き換えていた。file:// では fetch できず、http でも .sb の場所とは無関係のパスを見るので、読込んだ図の include 先の block が
黙って消え、表には「ID が無い」という別の理由だけが出た。VSCode 拡張は @include を解決せず parser のエラーにし、`npm run check` だけが
fs で正しく解決していた。3 つの形態で同じ図の見え方と診断が違った。

## 選択肢
1. fetch の起点を読込んだファイルの場所にする(ブラウザは読込んだファイルのパスを知らない。file:// では fetch できない)
2. 読込で本体と include 先を一緒に選ばせ、選んだファイルの中から相対パスで引く(フォルダ情報が無ければ同じ名前)。拡張はホストが fs で読んで渡す
3. 保存時に include を展開して 1 ファイルにする(本文が変わり、無変更保存のバイト一致が崩れる)

## 決定
案 2。展開(`expandIncludes`)と診断(`checkIncluded`)、書き出しの知らせ(`includeDrops`)は `core/check/check-core.mjs` に置き、HTML 版・
VSCode 拡張・CLI が同じ関数を通す。読み方(read(path))だけが形態ごとに違う: HTML 版は「.sb 読込」の複数選択、拡張はホストの fs、CLI は fs。
- 展開後の各行は元のファイル・行・本文の何行目から来たかを持ち、診断は本文の行番号で出す(include 先の行は @include 行に寄せ、場所を添える)
- 読めない @include(循環を含む)はその行のエラー。ID が無い接続には読めていない include 先を示す。SVG / PNG / Excel / Mermaid の書き出しも知らせる
- 本文(dsl)は展開しない。保存は @include 行をそのまま残し、無変更保存はバイト一致のまま
- 複数選んだときは、ほかの選んだファイルから include されていないものが本体になる

## 影響
- HTML 版の fetch による include(ページからの相対)は無くなる。本文欄に @include を書いた図は、読込で include 先を選ぶまで「読めない」と出る
- parse は `parseDoc()`(HTML)/ `parseDoc()`(拡張 webview)を通り、`parsed` と展開結果(`expanded` / `EXP`)はいつも同じ本文から作る
