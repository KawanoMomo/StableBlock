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

`stableblock.html` をブラウザで開くだけ。オフラインで動作。

### VSCode拡張

```bash
cd vscode-stableblock
npm install
npx vsce package --allow-missing-repository
code --install-extension stableblock-0.6.0.vsix
```

`.sb` ファイルを開いて `Ctrl+Shift+V` でプレビュー。

### MCPサーバー

LLMから図を操作するためのMCPサーバー（18ツール）。

```bash
cd mcp-server
uv sync
uv run stableblock-mcp
```

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
- **検索/フィルタ** — ツールバーの検索欄でID・ラベル検索、非マッチ要素を薄暗く
- **ハイライトモード** — 接続のないブロックをトーンダウン表示（H キー）
- **ID補正** — `__new_` プレースホルダーIDをラベルから自動命名

### 注釈レイヤー
- **`note` DSL構文** — ブロックの上位レイヤーに注釈を配置
- **表示/非表示トグル** — ◇ 注釈ボタン / N キー
- **編集モード** — ✎ 編集ボタンで注釈のみ操作可能、ブロックはロック
- **注釈→ブロック接続** — 常に破線で描画

### エクスポート/変換
- **SVG / PNG / 透過PNG** — ツールバーから直接出力
- **クリップボードコピー** — PNG画像をクリップボードに
- **Mermaid変換** — flowchart TD 形式でエクスポート
- **.sb 保存/読込** — DSLファイルの入出力
- **@include** — 共通パーツのインクルード

### VSCode拡張
- **シンタックスハイライト** — キーワード、ID、ラベル、座標、色、矢印
- **双方向同期** — プレビューのGUI操作がエディタに書き戻される
- **Git Visual Diff** — HEADとのサイドバイサイドSVG差分表示
- **Ctrl+Z/Y/C/X/V/A** — ショートカットキー対応

### MCPサーバー（18ツール）
- `sb_new` / `sb_open` / `sb_save` / `sb_show` / `sb_undo`
- `sb_add_block` / `sb_add_group` / `sb_connect` / `sb_remove` / `sb_modify`
- `sb_modify_connection` / `sb_move_to_group` / `sb_fix_ids`
- `sb_from_template` / `sb_auto_layout` / `sb_validate_layout`
- `sb_resize_canvas` / `sb_export_svg`

## ファイル構成

```
stableblock/
├── LICENSE              # GPL-3.0
├── README.md
├── CHANGELOG.md
├── VERSION              # バージョン一元管理
├── bump-version.sh      # バージョン更新スクリプト
├── stableblock.html     # スタンドアロン版（これ1つで完結）
├── examples/            # サンプル .sb ファイル
├── vscode-stableblock/  # VSCode拡張
│   ├── package.json
│   ├── README.md
│   ├── src/extension.js
│   ├── syntaxes/stableblock.tmLanguage.json
│   └── language-configuration.json
└── mcp-server/          # MCPサーバー
    ├── pyproject.toml
    └── src/stableblock_mcp/
```

## ライセンス

[GPL-3.0](LICENSE)

フォント（IBM Plex / Noto Sans JP）はGoogle Fonts CDN経由で読込。いずれもSIL OFL 1.1。
