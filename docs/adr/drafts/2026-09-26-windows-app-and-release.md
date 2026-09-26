# [DRAFT] 配布物はタグの push で GitHub Actions が作る。Windows アプリは pywebview の薄い包み、画面は core/ を埋め込んだ単体 HTML

- ステータス: ドラフト(未採番。承認後 /adr で正式登録)
- 日付: 2026-09-26
- 起点: BLK-human-20260926-2100(タグを打ったら .vsix と Windows アプリ(setup.exe + portable.zip)を作って Release に付ける。PlantUMLAssist と同じ形)

## コンテキスト
配布物は手元で `build-vscode.bat` を回すしかなく、Windows で拡張も Python も無い人に渡す形が無かった。
また `stableblock.html` は `<script src="core/...">` で共通コアを読むため、HTML 1 枚だけを渡すと動かない。

## 選択肢
1. Electron で包む — 成果物が 100 MB を超える。人間が「使わない」と指定
2. pywebview(WebView2)+ PyInstaller + Inno Setup(PlantUMLAssist と同じ) — 50 MB 弱。WebView2 は Windows 10/11 に入っている
3. アプリは作らず HTML だけ配る — 拡張も Python も無い人の入口にならない

## 決定
案 2。
- 画面は `scripts/build-single-html.mjs` が core/*.js を埋め込んだ単体の stableblock.html(Release にもこの 1 ファイルを添付する)。
  リポジトリの stableblock.html は変えない(開発・E2E は今どおり core/ を読む)
- `packaging/app.py` は stableblock.html を file:// で開くだけ。書き出しは pywebview の ALLOW_DOWNLOADS で保存ダイアログになる
  (今の Import / Export をそのまま使う。アプリ専用の保存処理は作らない)。窓のタイトルに版(ビルド時に git tag から version.txt へ焼く)
- `.github/workflows/windows-app.yml`: タグ `v*` の push と手動起動で、vsix(同梱漏れの確認付き)→ 単体 HTML → exe → setup.exe(版がタグと一致するか確認)
  → portable.zip → 展開して exe を `--smoke` で起動し初期画面(見本の図・ステータスバー・共通コア)が出るかを確かめ(出なければ失敗)→ Release に 4 つを添付
- 拡張の package-lock.json は git 管理外なので CI は `npm ci` でなく `npm install`
- アイコンは `packaging/icon.svg` が正本で、`node packaging/make-icon.mjs` が icon.ico に起こす(ico はコミットする)

## 影響
- `npm run build:app`(pyinstaller まで)・`npm run build:html` が増える。出力の dist/・build/ は git 管理外
- 版の正本は git tag(アプリ)と VERSION(bump-version.sh が揃える拡張・HTML)の 2 つのまま。アプリの版はタグから取る
