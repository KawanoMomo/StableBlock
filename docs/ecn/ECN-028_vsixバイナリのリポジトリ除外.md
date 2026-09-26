# ECN-028: vsixバイナリのリポジトリ除外

- **ステータス**: 適用済
- **種別**: リポジトリ管理改善
- **対象コミット**: `e277783`
- **影響ファイル**: `vscode-stableblock/.gitignore`

## コンテキスト

ビルド成果物であるvsixファイル（VSCode拡張パッケージ）がGitリポジトリに含まれており、リポジトリサイズの増大とバイナリファイルの差分管理の非効率が問題だった。

## 対策

### バイナリ削除

リポジトリから既存のvsixファイルを削除。

- `stableblock-0.4.5.vsix` (14,025 bytes)
- `stableblock-0.4.6.vsix` (14,049 bytes)

### .gitignore追加

`vscode-stableblock/.gitignore` に以下を追加:

```
node_modules/
*.vsix
```

## 設計判断

vsixファイルはソースコードから再生成可能なビルド成果物であり、バージョン管理の対象とすべきではない。配布はGitHub ReleasesやVSCode Marketplaceで行う。

## 効果

- リポジトリサイズの削減
- git diffでバイナリ差分が表示される問題の解消
- 将来のvsixビルドが自動的にトラッキング対象外
