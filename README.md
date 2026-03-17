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

`stableblock.html` をブラウザで開くだけ。32KB、オフラインで動作。

### VSCode拡張

```bash
cd vscode-stableblock
npm install
npx vsce package --allow-missing-repository
code --install-extension stableblock-0.5.1.vsix
```

`.sb` ファイルを開いて `Ctrl+Shift+V` でプレビュー。

## DSL構文

```
@canvas width=960 height=520 grid=20

# グループ（先に書いたものが背面）
group app "Application" at 1,1 size 46x6 color=#EEF2FF border=#818CF8

# ブロック
block ui "UI" at 2,3 size 9x3 color=#6366F1 text=#FFFFFF round=6

# 接続
ui -> comm
core0 --> core1            # 双方向
data -> log "payload"      # ラベル付き
err -> handler style=dashed # 破線
```

座標・サイズはグリッド単位。色はHEX直接指定。`\n` でラベル内改行。

## 機能

- **ドラッグ＆ドロップ** — ブロック/グループを移動、DSLに自動反映
- **リサイズハンドル** — 8方向、ドラッグでサイズ変更
- **グループ連動** — 親グループを動かすと子も全て追従
- **Shift+クリック複数選択** — 一括移動・サイズ変更・色変更・削除
- **プロパティパネル** — ラベル、座標、サイズ、色、角丸、スタイルをGUIで編集
- **グループ内ブロック追加** — グループ選択時にプロパティから直接ブロックを追加
- **接続管理** — 2ブロック選択時にプロパティから接続・削除・方向変更・双方向切替
- **矢印キー移動** — 選択アイテムを矢印キーで1グリッド単位ずつ移動
- **ハイライトモード** — 接続のないブロックをトーンダウン表示（H キー / HL ボタン）
- **Ctrl+Z / Ctrl+Y** — Undo / Redo（最大80段）
- **Ctrl+C / Ctrl+X / Ctrl+V** — コピー / 切取 / 貼付（HTML版）
- **Delete** — 選択アイテム削除（関連する接続線も自動削除）
- **エクスポート** — SVG / PNG / .sb
- **インポート** — .sb ファイル読込
- **VSCode双方向同期** — プレビューでのGUI操作がエディタに書き戻される

## ファイル構成

```
stableblock/
├── LICENSE              # GPL-3.0
├── README.md
├── VERSION              # バージョン一元管理
├── bump-version.sh      # バージョン更新スクリプト
├── stableblock.html     # スタンドアロン版（これ1つで完結）
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
