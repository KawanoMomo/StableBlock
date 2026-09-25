# [DRAFT] 図をまたぐ ID の参照探しと改名を core/label に置き、CLI と VSCode の F2 から呼ぶ

- ステータス: ドラフト(未採番。承認後 /adr で正式登録)
- 日付: 2026-09-26
- 課題: BLK-primary-20260926-0451(全図横断の改名を 1 操作でできない・参照元を開かずに探せない)

## コンテキスト
1 枚の中の改名はプロパティ欄の「ID」(core/label の renameIdInDsl)でできるが、12 枚 + 共通部(`@include`)にまたがる改名と、
どの図が ID を参照しているかの検索には入口が無かった。HTML 版は file:// で動くためフォルダを読めない。

## 選択肢
1. 新しい画面(HTML 版にフォルダを開く機能)を作る
2. 既存の入口を延ばす: 図の検査 CLI(`npm run check`)に `--refs` / `--rename` を足し、VSCode 拡張は標準の F2(シンボルの名前変更)と
   Shift+F12(すべての参照を検索)に載せる。計算は core/label に純粋関数(findIdInDsl / idSpansInLine / renameIdAcrossDsl / planRename)で置く
3. 別の CLI(`npm run rename`)を新設する

## 決定
案 2。新しい画面・ボタンを増やさない(owner の指定)。フォルダを読めるのは CLI と VSCode だけで、両者が同じ planRename を呼ぶ。
planRename は全図を先に調べ、改名先が既にどこかで定義されている・1 枚の中で改名元が重複定義されている(ECN-013)・使えない表記のときは
何も書かずに理由を返す(一部の図だけ書き換わる状態を作らない)。定義の無い図(`@include` 先の定義を参照する図)は接続の from / to だけを変える。

## 影響
- VSCode 拡張ホストは ESM の label-core.mjs を `import()` で読む(リポジトリ内 / VSIX 同梱の両レイアウト。同梱は prepackage-core.js が既にコピーしている)
- CLI の `collect` は `.` で始まるフォルダと node_modules を降りない(図の検査も同じ)
