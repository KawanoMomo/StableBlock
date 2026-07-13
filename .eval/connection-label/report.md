# 接続線ラベル機能 視覚検証レポート (HTML版)

## 総合判定: PASS (チェックリスト 8/8 すべて PASS)

- 対象機能: 接続線ラベルの UI 入力・位置指定 (`lpos=`)・白背景矩形 (StableBlock HTML版)
- 実行日時: 2026-07-14
- 検証URL: http://localhost:8931/stableblock.html (ローカルHTTPサーバー経由。Playwright MCP は file:// をブロックするため)
- 検証者: evaluator エージェント (Playwright MCP 実機操作)
- console.error (favicon.ico 404 除く): **0 件**
- network 失敗 (favicon.ico 404 除く): **0 件** / 共有モジュール `core/label/label-core.browser.js` は 200 OK でロード

> 補足: チェックリスト8項目の機能検証はすべて PASS。別途、スコープ外の横断ADR (ADR-011: DSLエディタ Tab=2スペース) の逸脱を1件観測。本機能の判定はゲートしないが、対応要否の判断はユーザーに委ねる (詳細は「ADR準拠チェック」節)。

## 証拠ファイル一覧

- `AC1-overview-5positions.png` — 5方向ラベル全景
- `AC3-zoom-japanese-bg.png` — 175%ズーム 日本語背景密着
- `AC4-conn-section-label-ui.png` — 接続セクションUI (入力欄+5ボタン)
- `AC5-focus-retained-typing.png` — フォーカス保持 (ECN-003)
- `AC6-empty-label-line-remains.png` — 空文字化で接続線残存 (ECN-002)
- `AC7-lpos-button-active-follow.png` — 位置ボタン書込+active追従
- `AC8a-straight-mode.png` / `AC8b-ortho-mode.png` — 線種切替追従
- `label-geometry.json` — ラベル基点・幾何中点・背景矩形の実測座標
- `console.log` / `network.json` — コンソール・ネットワーク記録

座標系: SVG user unit = grid × 20px (例: ブロックa中心 = (120,70))。

## チェックリスト別の判定

### 1. 5方向すべてのラベルが指定位置に白背景付きで表示 (位置未指定=右) — PASS
証拠: AC1-overview-5positions.png, label-geometry.json

| ラベル | 指定lpos | text-anchor | 基点(幾何中点)からのオフセット | 白背景矩形 |
|---|---|---|---|---|
| デフォルト右 | 未指定→right | start | mid(400,70) → x+10 = (410,70) | rect(406,63,68×14,rx2) |
| 中央ラベル | center | middle | mid(400,270) オフセットなし | rect(371,263,58×14,rx2) |
| 左 | left | end | mid(120,170) → x−10 = (110,170) | rect(96,163,18×14,rx2) |
| 上 | top | middle | mid(680,170) → y−10 = (680,160) | rect(671,153,18×14,rx2) |
| 下です | bottom | middle | mid(260,370) → y+10 = (260,380) | rect(241,373,38×14,rx2) |

全ラベルに `dominant-baseline=central`・`font-size=10`・`font-weight=500`・白角丸矩形(fill=#FFFFFF, rx=2)。仕様§3 オフセット表と完全一致。

### 2. straight / ortho でもラベルが線の幾何中点基準 (弦中点への退行なし) — PASS
- `b -> d "上" route=straight`: パス `M680,100 L680,240`、幾何中点(680,170)=ラベル基点。
- `c -> e "下です" route=ortho`: パス `M120,300 L120,320 L120,370 L400,370 L400,420 L400,440`。区間長[20,50,280,50,20]、全長420、半長210点=第3区間 x=260 → 半長点(260,370)にラベル基点が完全一致(中央水平セグメント上)。
- curve系も描画パス制御点から再計算した3次ベジェ t=0.5 中点とラベル基点が一致。

### 3. 日本語ラベルで背景矩形がテキスト幅に一致 — PASS
証拠: AC3-zoom-japanese-bg.png (175%ズーム), label-geometry.json

| ラベル | getBBox幅 | rect幅 | 左padding | 右padding |
|---|---|---|---|---|
| デフォルト右 | 60 | 68 | 4 | 4 |
| 中央ラベル | 50 | 58 | 4 | 4 |
| 左 | 11 | 18 | 3 | 4 |
| 上 | 10 | 18 | 4 | 4 |
| 下です | 30 | 38 | 4 | 4 |

背景=テキスト実描画幅+横4px×2。はみ出し・不足なし("左"のみグリフ実インク幅とmeasureTextの1px差、許容範囲)。

### 4. 2ブロック選択→接続セクションにラベル入力欄と5位置ボタン — PASS
証拠: AC4-conn-section-label-ui.png。a→c の2選択で「接続」セクションにラベル入力欄(value="左")と5ボタン(右/左/上/下/中央)が出現、lpos=left で「左」がactive。
(注: 検証DSLのブロックbはプレビュー枠外のため、両方可視の a→c で検証。検証意図は同一)

### 5. 1文字ずつ入力してもフォーカス保持 (ECN-003 再発防止) — PASS
証拠: AC5-focus-retained-typing.png。pressSequentially で "テスト入力ABC" を実キー入力。8キーストローク全体で `document.activeElement === 入力欄` = true、value 全8文字蓄積、DSL に即時反映。

### 6. 空文字化で DSL から `"..."` のみ消え接続線は残る (ECN-002 再発防止) — PASS
証拠: AC6-empty-label-line-remains.png。DSL `a -> c lpos=left`(ラベルのみ除去、lpos・接続行保持)、接続パス残存、Conn数=5維持、空化直後もフォーカス保持。

### 7. 位置ボタン押下で DSL に `lpos=` 書込・active 追従 — PASS
証拠: AC7-lpos-button-active-follow.png。「上」→ `lpos=top` + active追従 + 基点移動。「中央」→ `lpos=center` を明示書込(仕様§5どおり)+ active追従。

### 8. 線種切替 (曲線/直線/直角) でラベルが各経路の幾何中点に追従 — PASS
証拠: AC8a-straight-mode.png, AC8b-ortho-mode.png。3モードすべてでラベル基点=パス幾何中点。明示 route を持つ接続はグローバル線種切替の影響を受けず各自の経路・中点を維持。

## ADR準拠チェック

| ADR | 結果 | 備考 |
|-----|------|------|
| ADR-001 DOM方式インタラクションモデル | 準拠 | data-id/data-type ベースの選択動作を確認 |
| ADR-002 選択モデル | 観測対象外(内部構造)/複数選択の成立を間接確認 | |
| ADR-011 DSLエディタ Tab=2スペース | **逸脱 (スコープ外・既存)** | StableBlock #editor は Tab でフォーカスが外に移動(2スペース挿入なし)。本機能(Task 5-10)が触れない既存領域で、本機能による導入・悪化ではない。ADR-011 の結果節も StableBlock を適用対象に挙げていない。対応要否はユーザー判断に委ねる |

## 推定原因 (FAILの場合)
該当なし (チェックリスト全項目 PASS)。
