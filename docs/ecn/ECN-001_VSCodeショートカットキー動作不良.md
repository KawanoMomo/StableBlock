# ECN-001: VSCode ショートカットキーの動作不良

- **ステータス**: 解決済
- **Issue**: #1
- **対象コミット**: `079781e`, `7eb7859`, `5c1b74f`, `b336138`
- **影響ファイル**: `vscode-stableblock/package.json`, `vscode-stableblock/src/extension.js`

## コンテキスト

VSCode拡張のWebviewパネル上で、Ctrl+Z（Undo）、Ctrl+C/X/V（コピー/カット/ペースト）、Delete/Backspaceなどの標準ショートカットキーが動作しなかった。原因はVSCodeがWebviewにキーイベントを到達させる前にインターセプトするため。

## 問題の詳細

1. **Ctrl+Z/Y/A**: VSCodeがExtensionレベルでインターセプトし、Webviewのkeydownイベントに到達しない
2. **Ctrl+C/X/V**: VSCodeがElectron/ネイティブレベルでインターセプトし、Extension keybindingの解決すらバイパスする
3. **Delete/Backspace**: VSCodeはインターセプトしないが、Extension keybindingに登録するとプロパティパネルのinputフィールドでのテキスト削除が効かなくなる

## 対策

ショートカットの種類ごとにハンドリング方式を分離する3層構造を採用した。

### 層1: Extension keybinding + postMessage（Ctrl+Z/Y/Shift+Z/A）

VSCodeがインターセプトするキーはExtension側でコマンド登録し、`postMessage`でWebviewに転送する。

### 層2: Webview keydownハンドラ（Delete/Backspace, Ctrl+C/X/V）

VSCodeがインターセプトしないキー、およびイベントがWebviewに到達した場合のフォールバック。inputフィールドにフォーカスがある場合はearly returnして通常のテキスト編集を優先。

### 層3: Clipboard イベントハンドラ（copy/cut/paste）

Ctrl+C/X/VはElectronレベルでインターセプトされるため、`document.addEventListener('copy'/'cut'/'paste')` をフォールバックとして登録。

### 不採用とした手法

- **負のkeybinding（`-command`構文）**: Extension の `package.json` では非対応（`keybindings.json`専用）であるため削除

## 結果

- 全ショートカットキーがWebviewパネル上で正常動作
- プロパティパネルのinputフィールドでの文字入力・削除は阻害されない
- ローカルクリップボード変数により、Webview内でのコピー/ペーストが独立動作
