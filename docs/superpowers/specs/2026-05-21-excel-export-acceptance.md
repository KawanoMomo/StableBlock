# Excel Export 受け入れ確認 (2026-05-21)

仕様書: `2026-05-21-excel-export-design.md` §10 受け入れ基準

## 自動テスト

- [x] `npm test` 全パス (40 tests pass, 0 fail) — Phase 1 完了時点で確認済

## 手動検証（ユーザー実施）

### HTML 版

- [ ] `fixtures/basic.sb` を HTML 版にロードして Excel ボタン → 正常な xlsx ダウンロード
- [ ] `fixtures/with-group.sb` 同様
- [ ] `fixtures/with-note.sb` 同様

ローカルサーバー起動方法:
```bat
start-html.bat
```
（リポジトリルートで実行。Python優先、無ければ npx http-server にフォールバック。ブラウザは自動で開く。）

### VSCode 拡張

- [ ] `build-vscode.bat` を実行（パッケージ化 + インストールを一括）
- [ ] VSCode 再起動またはウィンドウリロード
- [ ] 任意の `.sb` をプレビューし、ツールバーに Excel ボタンが表示される
- [ ] ボタン → 保存ダイアログ → diagram.xlsx 保存

### Excel 上での編集確認 (Excel 365)

- [ ] 各シェイプを個別選択できる
- [ ] テキストをダブルクリックで編集できる
- [ ] 色を右クリック → 個別変更できる
- [ ] ドラッグで位置を変更できる
- [ ] ハンドルでサイズを変更できる

### LibreOffice Calc での確認

- [ ] basic.xlsx が LibreOffice Calc で開ける（エラーなし）
- [ ] レイアウトが Excel と同じ

### 既存 Excel 設計書への貼り付け確認

- [ ] 任意の既存 .xlsx を開く
- [ ] エクスポートした diagram.xlsx を開く
- [ ] 全シェイプ選択 → コピー → 既存ブックに貼り付け
- [ ] 貼り付け先でシェイプが表示・編集できる

## スクリーンショット保存先

検証時にスクリーンショットを `docs/screenshots/` に保存:
- `excel-html-export.png` — HTML 版の Excel ボタンクリック → ダウンロード成功
- `excel-vscode-button.png` — VSCode webview の Excel ボタン
- `excel-vscode-output.png` — エクスポートした .xlsx を Excel で開いた状態

## メモ

- Phase 1 Task 1.15 の「LibreOffice headless 視覚回帰」は CI 未整備のため本チェックリストに統合
- Phase 3 Task 3.4 の「VSCode 拡張パッケージ化と手動検証」も本チェックリストに統合
