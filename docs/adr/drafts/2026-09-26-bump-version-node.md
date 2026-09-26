# ADR ドラフト: 版番号の一括更新を node スクリプトにする

- 状態: ドラフト(採番は人間)
- 関連: ECN-027(バージョン一元管理)、ECN-014(バッジ正規表現の修正)、BLK-releaser-20260926-0953

## 背景
`bump-version.sh` は sed でファイルごとに置き換えていたが、ルートの `package.json` が対象から漏れ、v0.8→v0.9 で手直しが要った。
sed は当たらなくても黙って成功するため、漏れも正規表現の不一致(ECN-014)も実行時に分からない。

## 案
1. sed の行を足す(ルートの package.json / package-lock.json)。漏れと不一致は引き続き黙って通る
2. 本体を `scripts/bump-version.mjs`(node)にし、`bump-version.sh` はそれを呼ぶだけにする。対象と正規表現を 1 つの表に持ち、
   当たらない箇所があれば何も書かずに失敗する。unit テスト(`tests/bump-version.test.mjs`)で表と今のリポジトリの一致を守る

## 決定
案 2。Windows でも Git Bash / WSL を問わず同じ動きになり、npm test が「版番号が揃っていない」を検出できる。
改行コード(ルートの package.json / package-lock.json は CRLF)は該当箇所だけの置換で保つ。
