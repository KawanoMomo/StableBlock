# ECN-025: MCPサーバー導入

- **ステータス**: 適用済
- **種別**: 機能追加
- **対象コミット**: `72ee905`, `c6caf72`, `527ad64`, `8aad67e`
- **影響ファイル**: `mcp-server/` ディレクトリ全体

## コンテキスト

DSL構文を知らないLLM（小〜中規模モデル）がブロック図を会話的に設計・編集する手段がなかった。

## 対策

Model Context Protocol (MCP) サーバーを構築し、LLMがDSL構文を意識せずにブロック図を操作できるツール群を提供。

### アーキテクチャ

- Python (FastMCP) ベースのステートフルサーバー
- DSLパーサー/ジェネレーターは `stableblock.html` からポーティング
- 状態管理: メモリ上で図の状態を保持、undo履歴最大30レベル

### ツール一覧（21ツール、4段階で拡張）

#### 第1弾: 基本操作（12ツール） `72ee905`

| ツール | 説明 |
|--------|------|
| `sb_new` | 新規図の作成 |
| `sb_open` | .sbファイルの読み込み |
| `sb_save` | .sbファイルへの保存 |
| `sb_show` | 現在の図の表示 |
| `sb_add_block` | ブロック追加 |
| `sb_add_group` | グループ追加 |
| `sb_connect` | 接続作成 |
| `sb_remove` | 要素削除 |
| `sb_modify` | 要素の属性変更 |
| `sb_from_template` | テンプレートからの図生成 |
| `sb_auto_layout` | 自動レイアウト |
| `sb_export_svg` | SVGエクスポート |

テンプレート: layered, pipeline, grid の3種。自動レイアウトはtop-down, left-right, grid方式に対応。

#### 第2弾: レイアウト検証（+1ツール） `c6caf72`

| ツール | 説明 |
|--------|------|
| `sb_validate_layout` | 重なり・はみ出し・ラベル溢れの検出 |

保存前の必須ステップとしてLLMに指示。

#### 第3弾: 詳細表示・Undo（+4ツール） `8aad67e`

| ツール | 説明 |
|--------|------|
| `sb_show(detail=True)` | 全要素の座標・サイズ・色を表示 |
| `sb_undo` | 直前の操作を取り消し |
| `sb_resize_canvas` | キャンバスサイズ変更 |
| `sb_move_to_group` | ブロックのグループ間移動 |

#### 第4弾: 整列・交換・切断（+3ツール） `527ad64`

| ツール | 説明 |
|--------|------|
| `sb_swap` | 2要素の位置交換 |
| `sb_align` | 整列（8モード: left/right/top/bottom/center-h/center-v/distribute-h/distribute-v） |
| `sb_disconnect` | 接続の削除 |

### テスト

76テスト（parser, layout, templates, SVG, tools, validation）。

## 設計判断

- **ステートフル方式を採用した理由**: 図の状態をサーバー側で保持することで、LLMが毎回DSL全文を送受信する必要がない。undo機能もサーバー側で管理。
- **DSLパーサーの二重実装**: stableblock.htmlのJavaScript版とMCPサーバーのPython版が存在する。一方を変更した場合、もう一方の同期が必要。

## 効果

- LLMがDSL構文を知らなくてもブロック図を対話的に作成・編集可能
- テンプレートと自動レイアウトにより、LLMの空間配置の負担を軽減
- レイアウト検証により、要素の重なりやはみ出しをLLMが自律的に検出・修正
