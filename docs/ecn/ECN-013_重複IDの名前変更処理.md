# ECN-013: 重複IDの名前変更処理

- **ステータス**: 解決済
- **対象コミット**: `108d075`
- **影響ファイル**: `stableblock.html`, `vscode-stableblock/src/extension.js`

## コンテキスト

ブロックのコピー&ペーストなどで重複IDが発生した際のID自動修正（リネーム）機能が、一部のケースで誤った置換を行っていた。

## 問題の詳細

`fixNames()` がグローバル正規表現置換を使用していたため、DSL内に同一IDが複数存在する場合（重複ID状態）、全出現箇所が一括で同じ新IDに置換されてしまった。

例: ブロックAとブロックBが同じID `sensor` を持つ場合、両方とも `sensor_1` に置換され、重複が解消されない。

## 対策

### 要素定義の行番号ベース置換

`fixNames()` のリネームマッピングに `line` プロパティを追加し、要素定義（block/group/note）の置換を行番号で特定する方式に変更。

```javascript
// 変更前: グローバル正規表現置換（全出現を一括置換）
dsl.replace(new RegExp(oldId, 'g'), newId)

// 変更後: 行番号指定置換（定義行のみ置換）
lines[mapping.line] = lines[mapping.line].replace(
  new RegExp(`^(\\s*(?:block|group|note)\\s+)${oldId}(\\s+)`),
  `$1${newId}$2`
)
```

### 接続線の先着マッピング

接続線（connect文）中のID参照は、重複IDのどちらを指すか曖昧なため、最初に出現した定義への先着（first-wins）マッピングで解決する。

## 結果

- 重複IDが個別に正しくリネームされる
- 既存の接続関係が可能な限り保持される
- 行番号ベースにより定義行以外のID出現（接続線中の参照）を誤って書き換えない
