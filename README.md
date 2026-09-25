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
code --install-extension stableblock-0.8.0.vsix
```

`.sb` ファイルを開いて `Ctrl+Shift+V` でプレビュー。

### テスト実行

```bat
run-tests.bat
```

JS エミッタの単体・golden ファイルテストを実行（Node.js組み込みテストランナー）。

E2E(ペルソナ台本の手順 = `tests/e2e/scenarios/{persona}-{手順}.spec.js`): 初回だけ `npm install` と `npx playwright install chromium`、以後 `npm run test:e2e`。
静的サーバは worker ごとに `python -m http.server` を `SB_PORT`(既定 8901)+ worker 番号から起こす。`SB_PORT` に既にこのリポジトリの server があれば再利用する。
結果・保存物は `test-results/` 配下のみ(コーパス往復テストの結果は `test-results/corpus-roundtrip.json`)。

### 図の検査(開かずに)

`npm run check -- <file.sb | フォルダ> ...` で、画面のエラー表示と同じ診断(読めない行の理由・存在しない ID への接続・block の重なり・線が別の block の上を横切る)を
`ファイル:行: error|warn: 内容` で出す。`@include` 先の block を横切る線も include 元の図の行で示す。error があれば終了コード 1。

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
- **接続管理** — 2ブロック選択時に接続・削除・方向変更・双方向切替・色・太さ・スタイル
- **矢印キー移動** — 選択アイテムを矢印キーで1グリッド単位ずつ移動
- **スナップガイド** — ドラッグ中に他ブロックとの整列ガイドラインを表示
- **検索/フィルタ** — ツールバーの「🔍 ID・ラベルで検索」欄で絞り込み、外れた要素を薄く表示
- **未接続を薄く** — 接続の無いブロックを薄く表示(ツールバー「◎ 未接続を薄く」/ H キー)
- **線の形** — route を書いていない接続の形(図全体の既定)を 曲線 → 直線 → 直角 と切り替える(ツールバー「⌇ 線の形」/ L キー)。本文の `@canvas` 行の `route=` に書かれ(曲線に戻すと消える)、画面・SVG・PNG・検査・VSCode 拡張が同じ形になる。接続ごとの形はプロパティ欄の「線の形」(接続行の `route=`。こちらが優先)
- **全体表示** — 図の全体を画面に収める(ツールバー「全体表示」/ F キー)
- **ID** — プロパティ欄の「ID」で決める・変える(英数字と `_`、表記はそのまま)。接続の参照も一緒に変わる。新しい要素の ID はラベルの入力に追従する

### 注釈レイヤー
- **`note` DSL構文** — ブロックの上位レイヤーに注釈を配置
- **注釈を表示** — 表示・非表示を切り替える(ツールバー「◇ 注釈を表示」/ N キー)
- **選択・追加** — 表示中の注釈はブロックと同じにクリックで選び、ドラッグ・ハンドルで動かす。何も選んでいないツール欄の「+ 注釈追加」で置く
- **注釈→ブロック接続** — 常に破線で描画

### エクスポート/変換
- **SVG / PNG / 透過PNG** — ツールバーから直接出力
- **PNGをコピー** — PNG画像をクリップボードに(ツールバー「PNGをコピー」)
- **Mermaid変換** — flowchart TD 形式でエクスポート
- **.sb 保存/読込** — DSLファイルの入出力
- **@include** — 共通パーツのインクルード
- **Excel エクスポート** — `.xlsx` 出力。各図形は Excel ネイティブシェイプとして個別に編集可能

### VSCode拡張
- **シンタックスハイライト** — キーワード、ID、ラベル、座標、色、矢印
- **双方向同期** — プレビューのGUI操作がエディタに書き戻される
- **Git Visual Diff** — HEADとのサイドバイサイドSVG差分表示
- **Ctrl+Z/Y/C/X/V/A** — ショートカットキー対応

## ファイル構成

```
stableblock/
├── LICENSE              # GPL-3.0
├── README.md
├── CHANGELOG.md
├── VERSION              # バージョン一元管理
├── bump-version.sh      # バージョン更新スクリプト
├── stableblock.html     # スタンドアロン版（これ1つで完結）
├── run-tests.bat        # 単体テストの実行
├── build-vscode.bat     # VSCode拡張のビルドとインストール
├── package.json         # テスト(npm test / npm run test:e2e)の依存
├── playwright.config.js # E2E の設定
├── core/                # HTML版と VSCode拡張の共通コア(DSL・ラベル・選択・配置・検査・画面の語彙・Excel/Mermaid 書き出し)
├── tests/               # コーパス往復テストと E2E(tests/e2e/scenarios)
├── docs/                # ECN と ADR
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
