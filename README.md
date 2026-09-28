# StableBlock

**テキストベース × レイアウト固定 × Git差分管理**

ブロック図を書くためのツール。PlantUMLやMermaidと同じくテキストで記述するが、グリッド座標をDSLに明記することで **生成するたびにレイアウトが変わる問題** を根本から解決した。

## なぜ作ったか

| ツール | テキストベース | レイアウト固定 | Git差分がクリーン |
|:--|:--:|:--:|:--:|
| Excel / Visio | ✗ | ○ | ✗ バイナリ |
| PlantUML | ○ | ✗ 自動配置 | △ レイアウト変動 |
| Mermaid | ○ | ✗ 自動配置 | △ レイアウト変動 |
| D2 | ○ | △ 有料エンジンのみ | △ |
| **StableBlock** | **○** | **○** | **○** |

## Git diff の例

```diff
- block swc_hmi "SWC\nHMI" at 2,3 size 9x3 color=#6366F1
+ block swc_hmi "SWC\nHMI" at 2,3 size 12x3 color=#6366F1
```

「HMIブロックの幅が 9→12 に変わった」ことが一目でわかる。

## 使い方

### HTML版（環境構築不要）

`stableblock.html` をブラウザで開くだけ。オフラインで動作。Excel エクスポートも含めて `file://` で完結。

### VSCode拡張

```bat
build-vscode.bat
```

`build-vscode.bat` は `vsce package` でビルドして `code --install-extension` でインストールまで実行。手動の場合は:

```bash
cd vscode-stableblock
npm install
npx vsce package --allow-missing-repository
code --install-extension stableblock-2.2.0.vsix
```

`.sb` ファイルを開いて `Ctrl+Shift+V` でプレビュー。

### Windows アプリ版・配布物

入手: GitHub の [Releases](https://github.com/KawanoMomo/StableBlock/releases) にタグごとに `StableBlock-{版}-setup.exe`(インストーラ)・`StableBlock-{版}-portable.zip`(展開して `StableBlock.exe`)・拡張の `.vsix`・1 ファイルで動く `stableblock.html` が付く(タグ `v*` の push で `.github/workflows/windows-app.yml` が作る)。
作り方: `pip install pywebview pyinstaller` の後に `npm run build:app` で `dist/StableBlock/StableBlock.exe`(画面は `core/` を埋め込んだ stableblock.html を pywebview で開く薄い包み。`npm run build:html` は単体の `dist/stableblock.html` だけを作る)。
インストーラは Inno Setup 6 で `iscc /DAppVersion=1.1 packaging\installer.iss`。版は git tag から取る(`packaging/version_info.py`)。

### テスト実行

```bat
run-tests.bat
```

JS エミッタの単体・golden ファイルテストを実行（Node.js組み込みテストランナー）。

E2E(ペルソナ台本の手順 = `tests/e2e/scenarios/{persona}-{手順}.spec.js`): 初回だけ `npm install` と `npx playwright install chromium`、以後 `npm run test:e2e`。
静的サーバは worker ごとに `python -m http.server` を `SB_PORT`(既定 8901)+ worker 番号から起こす。`SB_PORT` に既にこのリポジトリの server があれば再利用する。
結果・保存物は `test-results/` 配下のみ(コーパス往復テストの結果は `test-results/corpus-roundtrip.json`)。
コーパス往復(`tests/corpus-roundtrip.test.js`)が assert するのは同梱の .sb(`core/excel/fixtures`・`tests/e2e/fixtures`)だけ。persona-data の .sb は JSON に `{total, passed, failed[]}` を書き、崩れた一覧を console に出すだけで赤にしない。
自分の変更で往復を壊していないかは、main(`git checkout --detach main`)と自分の branch で `node --test tests/corpus-roundtrip.test.js` を回し、JSON の `passed` が main の値より減っていないことで見る。

### 図の検査(開かずに)

`npm run check -- <file.sb | フォルダ> ...` で、画面のエラー表示と同じ診断(読めない行の理由・存在しない ID への接続・block の重なり・group の枠をまたぐ block や group・線が別の block の上を横切る・`style=` / `route=` / `grow=` / `lpos=` に取れない値)を
`ファイル:行: error|warn: 内容` で出す。`@include` 先の block を横切る線も include 元の図の行で示す。error があれば終了コード 1。

### ID の参照元探しと全図の改名(開かずに)

- `npm run check -- --refs SpiDrv <file.sb | フォルダ> ...` — ID を定義・参照している図と行を一覧する(`@include` 先を含む)
- `npm run check -- --rename SpiDrv Spi_Driver <file.sb | フォルダ> ... [--dry-run]` — 全図で ID を改名する。書き換えるのは定義行と接続の from / to だけで、
  定義行のラベルが旧 ID と同じ文字列(`block SpiDrv "SpiDrv"`)ならそのラベルも新 ID に揃える(ラベルの一部に含むだけなら触らない)。
  座標・サイズ・コメントの行は 1 バイトも変えない。改名先が既にどこかの図で定義されていれば、どの図も書き換えない
- VSCode 拡張では ID の上で F2(シンボルの名前変更)と Shift+F12(すべての参照を検索)が同じ処理でワークスペースの全 .sb をまたぐ
- ブラウザ版では「.sb 読込」で図をまとめて選ぶと、プロパティ欄の ID 欄 + Enter が読み込んだ全部の図を同じ規則で改名する。
  ラベル欄 + Enter(キャンバス上のラベル編集の確定も)は、同じ ID を定義しているほかの図のうち編集前と同じ表示名のものも揃える
  (違う表示名を付けた図は触らない)。ID を小文字・表示名をタイトルケースにする規約なら、ラベル欄 → ID 欄の 2 回で全図が揃う。「.sb 保存」で変わった図を全部書き出す

## DSL構文

```
@canvas width=960 height=520 grid=20

# グループ（先に書いたものが背面）
group app "Application" at 1,1 size 46x6 color=#EEF2FF border=#818CF8

# ブロック
block ui "UI" at 2,3 size 9x3 color=#6366F1 text=#FFFFFF round=6

# 注釈（別レイヤー）
note memo "重要な変更点" at 2,1 size 10x2 color=#FEF3C7 text=#92400E

# 接続
ui -> comm
core0 --> core1            # 双方向
data -> log "payload"      # ラベル付き
err -> handler style=dashed # 破線
api -> gw width=3           # 太線
api -> db route=ortho       # 直角(curved / straight / ortho。@canvas 行の route= が図全体の既定)
memo -> ui color=#F59E0B    # 注釈からブロックへ

# インクルード
@include "shared/common.sb"
```

座標・サイズはグリッド単位。色はHEX直接指定。`\n` でラベル内改行。

## 機能

### エディタ
- **ドラッグ＆ドロップ** — ブロック/グループを移動、DSLに自動反映
- **リサイズハンドル** — 8方向、ドラッグでサイズ変更
- **グループ連動** — 親グループを動かすと子も全て追従
- **Shift+クリック複数選択** — 一括移動・サイズ変更・色変更・削除
- **複数選択→グループ化** — 選択ブロックを囲むグループを自動作成
- **プロパティパネル** — ラベル、座標、サイズ、色、角丸、スタイルをGUIで編集
- **接続管理** — 2ブロック選択時に接続・削除・方向変更・双方向切替・色・太さ・スタイル。3 個以上をクリックした順に選ぶと「a → b → c」(または Enter)で鎖状に結ぶ(既にある組は足さない)。右ボタンで block から block へドラッグしても 1 本結べる(HTML 版)。結んだ直後はラベル欄にフォーカスがあり、打って Enter で次の接続へ
- **矢印キー移動** — 選択アイテムを矢印キーで1グリッド単位ずつ移動
- **スナップガイド** — ドラッグ中に他ブロックとの整列ガイドラインを表示
- **検索/フィルタ** — ツールバーの「🔍 検索」欄で ID・ラベルを絞り込み、外れた要素を薄く表示
- **未接続を薄く** — 接続の無いブロックを薄く表示(ツールバー「◎ 未接続」/ H キー)
- **線の形** — route を書いていない接続の形(図全体の既定)を 曲線 → 直線 → 直角 と切り替える(ツールバー「⌇ 線の形」/ L キー)。本文の `@canvas` 行の `route=` に書かれ(曲線に戻すと消える)、画面・SVG・PNG・検査・VSCode 拡張が同じ形になる。接続ごとの形はプロパティ欄の「線の形」(接続行の `route=`。こちらが優先)
- **全体表示** — 図の全体を画面に収める(ツールバー「全体表示」/ F キー)
- **ID** — プロパティ欄の「ID」で決める・変える(英数字と `_`、表記はそのまま)。接続の参照も一緒に変わる。新しい要素の ID はラベルの入力に追従する

### 注釈レイヤー
- **`note` DSL構文** — ブロックの上位レイヤーに注釈を配置
- **注釈を表示** — 表示・非表示を切り替える(ツールバー「◇ 注釈」/ N キー)
- **選択・追加** — 表示中の注釈はブロックと同じにクリックで選び、ドラッグ・ハンドルで動かす。何も選んでいないツール欄の「+ 注釈追加」で置く
- **注釈→ブロック接続** — 常に破線で描画

### エクスポート/変換
- **SVG / PNG / 透過PNG** — ツールバーから直接出力
- **PNGをコピー** — PNG画像をクリップボードに(ツールバー「PNGをコピー」)
- **Mermaid変換** — flowchart TD 形式でエクスポート
- **.sb 保存/読込** — DSLファイルの入出力
- **@include** — 共通パーツのインクルード。include 先は include 元のファイルからの相対パス。HTML 版は「.sb 読込」で本体と include 先を一緒に選ぶ(複数選択。ほかの選んだファイルから include されていないものが本体になる)。VSCode 拡張と `npm run check` はファイルから読む。読めない include はその行にエラーを出し、書き出しでも「入っていない」と知らせる。保存は @include 行をそのまま残す
- **Excel エクスポート** — `.xlsx` 出力。各図形は Excel ネイティブシェイプとして個別に編集可能

### VSCode拡張
- **シンタックスハイライト** — キーワード、ID、ラベル、座標、色、矢印
- **双方向同期** — プレビューのGUI操作がエディタに書き戻される
- **Git Visual Diff** — ファイルの Git の履歴から版を選び(新しい順)、今の本文と SVG・行差分で並べる(変わった要素に印)
- **Ctrl+Z/Y/C/X/V/A** — ショートカットキー対応

## ファイル構成

```
stableblock/
├── LICENSE              # GPL-3.0
├── README.md
├── CHANGELOG.md
├── VERSION              # バージョン一元管理
├── bump-version.sh      # バージョン更新スクリプト
├── stableblock.html     # スタンドアロン版（core/ と一緒に file:// で動く。1 ファイル版は npm run build:html）
├── run-tests.bat        # 単体テストの実行
├── build-vscode.bat     # VSCode拡張のビルドとインストール
├── package.json         # テスト(npm test / npm run test:e2e)の依存
├── playwright.config.js # E2E の設定
├── core/                # HTML版と VSCode拡張の共通コア(DSL・ラベル・選択・配置・検査・画面の語彙・Excel/Mermaid 書き出し)
├── tests/               # コーパス往復テストと E2E(tests/e2e/scenarios)
├── docs/                # ECN と ADR
├── scripts/             # 版の揃え直し(bump-version.mjs)と単体 HTML の生成(build-single-html.mjs)
├── packaging/           # Windows アプリ版(app.py・StableBlock.spec・installer.iss・アイコン)
├── .github/             # 配布物の自動ビルド(workflows/windows-app.yml)
└── vscode-stableblock/  # VSCode拡張
    ├── package.json
    ├── README.md
    ├── src/extension.js
    ├── syntaxes/stableblock.tmLanguage.json
    └── language-configuration.json
```

## ライセンス

[GPL-3.0](LICENSE)

フォント（IBM Plex / Noto Sans JP）はGoogle Fonts CDN経由で読込。いずれもSIL OFL 1.1。
