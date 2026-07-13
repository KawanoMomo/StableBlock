# 接続線ラベル UI入力・位置指定・背景 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接続線ラベルをUIから入力でき、位置(右/左/上/下/中央)を `lpos=` で指定でき、白背景矩形で常に読めるようにする。

**Architecture:** 純粋ロジック(幾何中点・ラベル配置・DSL書き戻し)を新設の共有モジュール `core/label/label-core.mjs` に置き、core/excel と同じ browser build + 実行時注入パターンで HTML版と VSCode拡張 Webview の両方から利用する。レンダラ・UIは各実装(コピー型)のまま個別に変更する。

**Tech Stack:** Vanilla JS(ESM共有モジュール)、Node built-in test runner(`node --test`)、Canvas 2D `measureText`、SVG文字列生成

**Spec:** `docs/superpowers/specs/2026-07-13-connection-label-position-design.md`(承認済み。要件・決定事項はすべてここに従う)

## Global Constraints

- 作業ブランチ: `feature/connection-label-position`(作成済み。main への直接コミット禁止)
- lpos の値: `right | left | top | bottom | center`。未指定・不正値は `right` にフォールバック
- 配置定数: オフセット=10px、背景 padding 横4px/縦2px、背景高さ=14px、`rx=2`、背景色 `#FFFFFF` 固定
- テキストは全位置で `dominant-baseline="central"`(垂直中心=ty)、`font-size:10px`・`font-weight:500`・`fill=接続線色`(現状踏襲)
- measureText のフォント指定は各実装のSVGと厳密一致: HTML版 `500 10px "IBM Plex Sans","Noto Sans JP",sans-serif` / 拡張版 `500 10px sans-serif`
- **extension.js の Webview コードは巨大なテンプレートリテラル内にある**: バッククォートと `${}` を使わない・文字列中の `\n` は `\\n` と書く(既存コードの規約)
- ECN-003: ラベル入力の `oninput` ではプロパティパネルを再構築しない(renderProps / props() を呼ばない)
- ECN-002: 空文字ラベルはDSLから引用符ごと除去し、接続行自体は保持する
- Excelエクスポート・Mermaid変換は変更しない(lpos は無視される)
- コミットは各タスク末尾で行う。メッセージは既存規約(`feat(label): ...` 等 conventional commits)
- `docs/ecn/` が未追跡だが今回のスコープ外。`git add` は必ずファイル個別指定で行うこと

## File Structure

| ファイル | 種別 | 責務 |
|---|---|---|
| `core/label/label-core.mjs` | 新規 | 純粋ロジック: ベジェ制御点/中点、折れ線頂点/半長点、lpos解析、ラベル配置計算、DSLラベル書き戻し |
| `core/label/label-core.browser.js` | 生成物(コミットする) | 上記の browser 版(`window.StableBlockLabel`) |
| `core/label/__tests__/label-core.test.mjs` | 新規 | label-core の単体テスト |
| `core/excel/build-browser.mjs` | 変更 | label-core.browser.js の生成を追加 |
| `core/excel/__tests__/build-browser.test.mjs` | 変更 | label-core.browser.js のドリフト検出テスト追加 |
| `package.json` | 変更 | test スクリプトに core/label のテストを追加 |
| `stableblock.html` | 変更 | script読込、パーサーlpos、パス+中点計算、ラベル描画、接続セクションUI |
| `vscode-stableblock/src/extension.js` | 変更 | label-core注入、パーサーlpos、ラベル描画、接続セクションUI |
| `docs/adr/drafts/2026-07-13-label-core-shared-module.md` | 新規 | 共有モジュール新設のADRドラフト |

---

### Task 1: 共有モジュール — 幾何計算(ベジェ・折れ線)

**Files:**
- Create: `core/label/label-core.mjs`
- Create: `core/label/__tests__/label-core.test.mjs`
- Create: `docs/adr/drafts/2026-07-13-label-core-shared-module.md`
- Modify: `package.json`(test スクリプト)

**Interfaces:**
- Consumes: なし(純粋関数のみ)
- Produces(後続タスクが依存する正確なシグネチャ):
  - `extendPoint(p, side, d)` → `{x,y}` — 点pを side('top'|'bottom'|'left'|'right')方向へ距離d移動
  - `bezierControls(fp, tp, fs, ts)` → `{c1:{x,y}, c2:{x,y}}` — 既存 `bpath()`/`bP()` と同一の制御点
  - `bezierMidpoint(fp, c1, c2, tp)` → `{x,y}` — 3次ベジェ t=0.5 の点
  - `orthoPoints(fp, tp, fs, ts)` → `[{x,y},...]` — 既存 `orthoPath()` と同一の頂点列(fp/tp含む)
  - `polylineMidpoint(pts)` → `{x,y}` — 折れ線全長の1/2地点

- [ ] **Step 1: 失敗するテストを書く**

`core/label/__tests__/label-core.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extendPoint, bezierControls, bezierMidpoint, orthoPoints, polylineMidpoint,
} from '../label-core.mjs';

test('extendPoint moves point in side direction', () => {
  assert.deepEqual(extendPoint({ x: 10, y: 20 }, 'top', 5), { x: 10, y: 15 });
  assert.deepEqual(extendPoint({ x: 10, y: 20 }, 'bottom', 5), { x: 10, y: 25 });
  assert.deepEqual(extendPoint({ x: 10, y: 20 }, 'left', 5), { x: 5, y: 20 });
  assert.deepEqual(extendPoint({ x: 10, y: 20 }, 'right', 5), { x: 15, y: 20 });
});

test('bezierControls matches legacy bpath math (dist>=75 => cpd=dist*0.4)', () => {
  // dist=100, cpd=40
  const { c1, c2 } = bezierControls({ x: 0, y: 0 }, { x: 100, y: 0 }, 'right', 'left');
  assert.deepEqual(c1, { x: 40, y: 0 });
  assert.deepEqual(c2, { x: 60, y: 0 });
});

test('bezierControls floors cpd at 30 for short distances', () => {
  // dist=10 => cpd=30
  const { c1, c2 } = bezierControls({ x: 0, y: 0 }, { x: 10, y: 0 }, 'right', 'left');
  assert.deepEqual(c1, { x: 30, y: 0 });
  assert.deepEqual(c2, { x: -20, y: 0 });
});

test('bezierMidpoint is (P0+3C1+3C2+P3)/8', () => {
  const mid = bezierMidpoint({ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 60, y: 0 }, { x: 100, y: 0 });
  assert.deepEqual(mid, { x: 50, y: 0 });
  const mid2 = bezierMidpoint({ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 100, y: 60 }, { x: 100, y: 100 });
  assert.deepEqual(mid2, { x: 50, y: 50 });
});

test('orthoPoints horizontal-horizontal produces 6-point polyline', () => {
  // fs=right, ts=left => e1={20,0}, e2={80,60}, mx=50
  const pts = orthoPoints({ x: 0, y: 0 }, { x: 100, y: 60 }, 'right', 'left');
  assert.deepEqual(pts, [
    { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 50, y: 0 },
    { x: 50, y: 60 }, { x: 80, y: 60 }, { x: 100, y: 60 },
  ]);
});

test('orthoPoints vertical-vertical produces 6-point polyline', () => {
  // fs=bottom, ts=top => e1={0,20}, e2={100,40}, my=30
  const pts = orthoPoints({ x: 0, y: 0 }, { x: 100, y: 60 }, 'bottom', 'top');
  assert.deepEqual(pts, [
    { x: 0, y: 0 }, { x: 0, y: 20 }, { x: 0, y: 30 },
    { x: 100, y: 30 }, { x: 100, y: 40 }, { x: 100, y: 60 },
  ]);
});

test('orthoPoints vertical-horizontal produces 5-point polyline', () => {
  // fs=bottom(isVF), ts=left(!isVT) => e1={0,20}, e2={80,60} => corner {e1.x, e2.y}
  const pts = orthoPoints({ x: 0, y: 0 }, { x: 100, y: 60 }, 'bottom', 'left');
  assert.deepEqual(pts, [
    { x: 0, y: 0 }, { x: 0, y: 20 }, { x: 0, y: 60 }, { x: 80, y: 60 }, { x: 100, y: 60 },
  ]);
});

test('orthoPoints horizontal-vertical produces 5-point polyline', () => {
  // fs=right(!isVF), ts=top(isVT) => e1={20,0}, e2={100,40} => corner {e2.x, e1.y}
  const pts = orthoPoints({ x: 0, y: 0 }, { x: 100, y: 60 }, 'right', 'top');
  assert.deepEqual(pts, [
    { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }, { x: 100, y: 60 },
  ]);
});

test('polylineMidpoint finds half-length point on middle segment', () => {
  // 上のHHケース: 区間長 20,30,60,30,20 / 全長160 / 半分80 => 第3区間(垂直)の30px地点
  const pts = [
    { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 50, y: 0 },
    { x: 50, y: 60 }, { x: 80, y: 60 }, { x: 100, y: 60 },
  ];
  assert.deepEqual(polylineMidpoint(pts), { x: 50, y: 30 });
});

test('polylineMidpoint handles degenerate zero-length polyline', () => {
  assert.deepEqual(polylineMidpoint([{ x: 5, y: 5 }, { x: 5, y: 5 }]), { x: 5, y: 5 });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`(package.json 変更前なので直接: `node --test "core/label/__tests__/label-core.test.mjs"`)
Expected: FAIL — `Cannot find module '../label-core.mjs'`

- [ ] **Step 3: 最小実装を書く**

`core/label/label-core.mjs`:

```js
// StableBlock 接続線ラベルの共有ロジック(HTML版 / VSCode拡張 Webview 共用)。
// browser 版は core/excel/build-browser.mjs が label-core.browser.js を生成する
// (window.StableBlockLabel)。DOM API は使用禁止 — node --test で検証する純粋関数のみ。

export function extendPoint(p, side, d) {
  if (side === 'top') return { x: p.x, y: p.y - d };
  if (side === 'bottom') return { x: p.x, y: p.y + d };
  if (side === 'left') return { x: p.x - d, y: p.y };
  return { x: p.x + d, y: p.y };
}

export function bezierControls(fp, tp, fs, ts) {
  const dx = tp.x - fp.x, dy = tp.y - fp.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const cpd = Math.max(30, dist * 0.4);
  return { c1: extendPoint(fp, fs, cpd), c2: extendPoint(tp, ts, cpd) };
}

export function bezierMidpoint(fp, c1, c2, tp) {
  return {
    x: (fp.x + 3 * c1.x + 3 * c2.x + tp.x) / 8,
    y: (fp.y + 3 * c1.y + 3 * c2.y + tp.y) / 8,
  };
}

export function orthoPoints(fp, tp, fs, ts) {
  const gap = 20;
  const e1 = extendPoint(fp, fs, gap), e2 = extendPoint(tp, ts, gap);
  const isVF = fs === 'top' || fs === 'bottom', isVT = ts === 'top' || ts === 'bottom';
  if (isVF && isVT) {
    const my = (e1.y + e2.y) / 2;
    return [fp, e1, { x: e1.x, y: my }, { x: e2.x, y: my }, e2, tp];
  }
  if (!isVF && !isVT) {
    const mx = (e1.x + e2.x) / 2;
    return [fp, e1, { x: mx, y: e1.y }, { x: mx, y: e2.y }, e2, tp];
  }
  if (isVF && !isVT) return [fp, e1, { x: e1.x, y: e2.y }, e2, tp];
  return [fp, e1, { x: e2.x, y: e1.y }, e2, tp];
}

export function polylineMidpoint(pts) {
  let total = 0;
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    segs.push(len);
    total += len;
  }
  if (total === 0) return { x: pts[0].x, y: pts[0].y };
  let half = total / 2;
  for (let i = 0; i < segs.length; i++) {
    if (half <= segs[i]) {
      const t = half / segs[i];
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * t,
      };
    }
    half -= segs[i];
  }
  return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
}
```

- [ ] **Step 4: package.json の test スクリプトを両ディレクトリ対象に変更**

```json
"test": "node --test \"core/excel/__tests__/*.test.mjs\" \"core/label/__tests__/*.test.mjs\"",
"test:watch": "node --test --watch \"core/excel/__tests__/*.test.mjs\" \"core/label/__tests__/*.test.mjs\"",
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npm test`
Expected: PASS(既存 excel テスト含め全件)

- [ ] **Step 6: ADRドラフトを起票**

`docs/adr/drafts/2026-07-13-label-core-shared-module.md`:

```markdown
# [DRAFT] 接続線ラベルロジックの共有モジュール core/label 新設

- ステータス: ドラフト(未採番。承認後 /adr で正式登録)
- 日付: 2026-07-13

## コンテキスト
接続線ラベルの位置計算・DSL書き戻しは HTML版と VSCode拡張 Webview の両方で必要。
両実装はコピー型アーキテクチャで、二重実装はズレ(ドリフト)の温床になる。

## 選択肢
1. 両実装にロジックを重複実装(現状のコピー型を踏襲)
2. core/label/ に純粋関数 ESM を置き、core/excel と同じ browser build + 実行時注入で共有

## 決定
案2。理由: (a) node --test で単体テスト可能になる (b) 幾何計算のドリフトを構造的に防げる
(c) core/excel で確立済みのパターン(build-browser.mjs + ドリフト検出テスト)を再利用でき
新規インフラ投資が不要。レンダラ・UI層の共通化はスコープ外のまま(ADR対象外)。

## 影響
- stableblock.html は core/label/label-core.browser.js への <script src> 依存が増える
  (Excel エクスポートで既に sibling ファイル依存があり、単一ファイル性は既に失われている)
- vsce パッケージング: extension.js は実行時に REPO_ROOT から読むため core/excel と同条件
```

- [ ] **Step 7: コミット**

```bash
git add core/label/label-core.mjs core/label/__tests__/label-core.test.mjs package.json docs/adr/drafts/2026-07-13-label-core-shared-module.md
git commit -m "feat(label): 接続線ラベル用の共有幾何計算モジュール core/label を新設"
```

---

### Task 2: 共有モジュール — lpos解析とラベル配置計算

**Files:**
- Modify: `core/label/label-core.mjs`(関数追加)
- Modify: `core/label/__tests__/label-core.test.mjs`(テスト追加)

**Interfaces:**
- Consumes: なし
- Produces:
  - `parseLpos(rest)` → `'right'|'left'|'top'|'bottom'|'center'` — 接続行の属性文字列(rest)から `lpos=値` を抽出。未指定・不正値は `'right'`
  - `labelLayout(mid, lpos, textW)` → `{tx, ty, anchor, bg:{x, y, w, h, rx}}` — mid=幾何中点、textW=計測済みテキスト幅(px)。anchor は `'start'|'end'|'middle'`。dominant-baseline は呼び出し側で常に `central`

- [ ] **Step 1: 失敗するテストを追加**

`core/label/__tests__/label-core.test.mjs` に追記(import に `parseLpos, labelLayout` を追加):

```js
test('parseLpos extracts value with right default and fallback', () => {
  assert.equal(parseLpos('lpos=left'), 'left');
  assert.equal(parseLpos('color=#fff lpos=center width=2'), 'center');
  assert.equal(parseLpos(''), 'right');
  assert.equal(parseLpos(undefined), 'right');
  assert.equal(parseLpos('lpos=weird'), 'right');
  assert.equal(parseLpos('color=#64748B'), 'right');
});

test('labelLayout right: text starts 10px right of mid, bg wraps text', () => {
  const L = labelLayout({ x: 100, y: 50 }, 'right', 30);
  assert.equal(L.tx, 110);
  assert.equal(L.ty, 50);
  assert.equal(L.anchor, 'start');
  assert.deepEqual(L.bg, { x: 106, y: 43, w: 38, h: 14, rx: 2 });
});

test('labelLayout left: text ends 10px left of mid', () => {
  const L = labelLayout({ x: 100, y: 50 }, 'left', 30);
  assert.equal(L.tx, 90);
  assert.equal(L.anchor, 'end');
  assert.deepEqual(L.bg, { x: 56, y: 43, w: 38, h: 14, rx: 2 });
});

test('labelLayout top/bottom: ty offset, centered horizontally', () => {
  const t = labelLayout({ x: 100, y: 50 }, 'top', 30);
  assert.equal(t.tx, 100);
  assert.equal(t.ty, 40);
  assert.equal(t.anchor, 'middle');
  assert.deepEqual(t.bg, { x: 81, y: 33, w: 38, h: 14, rx: 2 });
  const b = labelLayout({ x: 100, y: 50 }, 'bottom', 30);
  assert.equal(b.ty, 60);
  assert.deepEqual(b.bg, { x: 81, y: 53, w: 38, h: 14, rx: 2 });
});

test('labelLayout center: no offset', () => {
  const L = labelLayout({ x: 100, y: 50 }, 'center', 30);
  assert.equal(L.tx, 100);
  assert.equal(L.ty, 50);
  assert.equal(L.anchor, 'middle');
  assert.deepEqual(L.bg, { x: 81, y: 43, w: 38, h: 14, rx: 2 });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL — `parseLpos is not a function`(SyntaxError: named export not found)

- [ ] **Step 3: 実装を追加**

`core/label/label-core.mjs` に追記:

```js
const LPOS_VALUES = ['right', 'left', 'top', 'bottom', 'center'];

export function parseLpos(rest) {
  const v = ((rest || '').match(/lpos=(\S+)/) || [])[1];
  return LPOS_VALUES.includes(v) ? v : 'right';
}

// 配置定数はスペック§3/§4 の QAログ決定値。テキストは全位置 dominant-baseline=central 前提。
export function labelLayout(mid, lpos, textW) {
  const OFFSET = 10, PAD_X = 4, PAD_Y = 2, FONT_H = 10;
  let tx = mid.x, ty = mid.y, anchor = 'middle';
  if (lpos === 'right') { tx = mid.x + OFFSET; anchor = 'start'; }
  else if (lpos === 'left') { tx = mid.x - OFFSET; anchor = 'end'; }
  else if (lpos === 'top') { ty = mid.y - OFFSET; }
  else if (lpos === 'bottom') { ty = mid.y + OFFSET; }
  const w = textW + PAD_X * 2, h = FONT_H + PAD_Y * 2;
  const x = anchor === 'start' ? tx - PAD_X
    : anchor === 'end' ? tx - textW - PAD_X
    : tx - textW / 2 - PAD_X;
  return { tx, ty, anchor, bg: { x, y: ty - h / 2, w, h, rx: 2 } };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add core/label/label-core.mjs core/label/__tests__/label-core.test.mjs
git commit -m "feat(label): lpos解析とラベル配置計算(labelLayout)を追加"
```

---

### Task 3: 共有モジュール — DSLラベル書き戻し

**Files:**
- Modify: `core/label/label-core.mjs`
- Modify: `core/label/__tests__/label-core.test.mjs`

**Interfaces:**
- Consumes: なし
- Produces:
  - `setConnLabelInDsl(dsl, from, to, label)` → 新しいDSL文字列。`from -> to` / `from --> to`(方向不問、`(from,to)` または `(to,from)`)の最初にマッチした接続行が対象。`label` 中の `"` は除去。置換/挿入/空文字なら除去。マッチ行がなければ元のDSLをそのまま返す

- [ ] **Step 1: 失敗するテストを追加**

```js
test('setConnLabelInDsl replaces existing label', () => {
  const dsl = 'block a "A" at 1,1 size 4x2\na -> b "old" color=#fff';
  assert.equal(setConnLabelInDsl(dsl, 'a', 'b', 'new'),
    'block a "A" at 1,1 size 4x2\na -> b "new" color=#fff');
});

test('setConnLabelInDsl inserts label before existing attributes', () => {
  assert.equal(setConnLabelInDsl('a -> b color=#fff', 'a', 'b', 'x'),
    'a -> b "x" color=#fff');
  assert.equal(setConnLabelInDsl('a --> b', 'a', 'b', 'x'), 'a --> b "x"');
});

test('setConnLabelInDsl removes label on empty string (ECN-002: 行は残す)', () => {
  assert.equal(setConnLabelInDsl('a -> b "old" width=2', 'a', 'b', ''),
    'a -> b width=2');
  assert.equal(setConnLabelInDsl('a -> b "old"', 'a', 'b', ''), 'a -> b');
});

test('setConnLabelInDsl matches direction-agnostically like setConnProp', () => {
  assert.equal(setConnLabelInDsl('b -> a "old"', 'a', 'b', 'new'), 'b -> a "new"');
});

test('setConnLabelInDsl strips double quotes from input', () => {
  assert.equal(setConnLabelInDsl('a -> b', 'a', 'b', 'say "hi"'), 'a -> b "say hi"');
});

test('setConnLabelInDsl is safe with $ patterns in label', () => {
  assert.equal(setConnLabelInDsl('a -> b "old"', 'a', 'b', 'cost $1 $& $$'),
    'a -> b "cost $1 $& $$"');
});

test('setConnLabelInDsl no-op when no matching connection', () => {
  assert.equal(setConnLabelInDsl('a -> b "old"', 'x', 'y', 'new'), 'a -> b "old"');
});

test('setConnLabelInDsl preserves leading whitespace and touches first match only', () => {
  const dsl = '  a -> b "one"\na -> b "two"';
  assert.equal(setConnLabelInDsl(dsl, 'a', 'b', 'z'), '  a -> b "z"\na -> b "two"');
});
```

(import 行に `setConnLabelInDsl` を追加)

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL — named export not found

- [ ] **Step 3: 実装を追加**

`core/label/label-core.mjs` に追記:

```js
// 接続行のラベルを置換/挿入/除去する。replace の第2引数は $ 特殊展開を避けるため必ず関数。
export function setConnLabelInDsl(dsl, from, to, label) {
  const clean = String(label).replace(/"/g, '');
  const lines = dsl.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(/^(\S+)\s+(-->|->)\s+(\S+)/);
    if (!m) continue;
    if (!((m[1] === from && m[3] === to) || (m[1] === to && m[3] === from))) continue;
    const line = lines[i];
    const hasLabel = /^(\s*\S+\s+(?:-->|->)\s+\S+\s*)"[^"]*"/.test(line);
    if (hasLabel && clean) {
      lines[i] = line.replace(/^(\s*\S+\s+(?:-->|->)\s+\S+\s*)"[^"]*"/, (_, head) => head + '"' + clean + '"');
    } else if (hasLabel) {
      lines[i] = line.replace(/^(\s*\S+\s+(?:-->|->)\s+\S+)\s*"[^"]*"/, (_, head) => head);
    } else if (clean) {
      lines[i] = line.replace(/^(\s*\S+\s+(?:-->|->)\s+\S+)/, (_, head) => head + ' "' + clean + '"');
    }
    break;
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add core/label/label-core.mjs core/label/__tests__/label-core.test.mjs
git commit -m "feat(label): DSL接続行ラベルの書き戻し関数 setConnLabelInDsl を追加"
```

---

### Task 4: browser build 拡張とドリフト検出

**Files:**
- Modify: `core/excel/build-browser.mjs`
- Modify: `core/excel/__tests__/build-browser.test.mjs`
- Create(生成): `core/label/label-core.browser.js`

**Interfaces:**
- Consumes: `core/label/label-core.mjs`(Task 1-3 の全 export)
- Produces: `core/label/label-core.browser.js` — `window.StableBlockLabel = { extendPoint, bezierControls, bezierMidpoint, orthoPoints, polylineMidpoint, parseLpos, labelLayout, setConnLabelInDsl }` を公開する classic script。`buildLabelCoreBrowser(source)` 関数(ドリフトテストが使用)

- [ ] **Step 1: 失敗するテストを追加**

`core/excel/__tests__/build-browser.test.mjs` に追記(既存 import 群のスタイルに合わせ、`buildLabelCoreBrowser` を import に追加):

```js
test('label-core.browser.js is up to date (drift detection)', () => {
  const src = readFileSync(new URL('../../label/label-core.mjs', import.meta.url), 'utf8');
  const built = readFileSync(new URL('../../label/label-core.browser.js', import.meta.url), 'utf8');
  assert.equal(built, buildLabelCoreBrowser(src),
    'Run `npm run build:browser` to regenerate label-core.browser.js');
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL — `buildLabelCoreBrowser` not exported / label-core.browser.js not found

- [ ] **Step 3: build-browser.mjs を拡張**

`core/excel/build-browser.mjs` — `buildEmitterBrowser` の直後に汎用化関数を追加し、`main()` に出力を追加:

```js
/**
 * Generic: strip `export` and expose all exported functions on a window global.
 */
export function buildBrowserGlobal(source, globalName, srcLabel) {
  const exportNames = [];
  const exportRegex = /^\s*export\s+(?:async\s+)?function\s+(\w+)/gm;
  let match;
  while ((match = exportRegex.exec(source)) !== null) {
    exportNames.push(match[1]);
  }
  if (exportNames.length === 0) {
    throw new Error(`build-browser: no exported functions found in ${srcLabel}`);
  }
  const stripped = source.replace(/^(\s*)export\s+(async\s+)?function\s+(\w+)/gm, '$1$2function $3');
  const trailer = `\n;window.${globalName} = { ` + exportNames.join(', ') + ' };\n';
  return `// Auto-generated by core/excel/build-browser.mjs from ${srcLabel}.\n` +
         '// DO NOT EDIT MANUALLY. Run `npm run build:browser` to regenerate.\n' +
         stripped + trailer;
}

export function buildLabelCoreBrowser(source) {
  return buildBrowserGlobal(source, 'StableBlockLabel', 'label-core.mjs');
}
```

`main()` 内に追加:

```js
const LABEL_SRC = join(__dirname, '..', 'label', 'label-core.mjs');
const OUT_LABEL_BROWSER = join(__dirname, '..', 'label', 'label-core.browser.js');
const labelSource = readFileSync(LABEL_SRC, 'utf8');
writeFileSync(OUT_LABEL_BROWSER, buildLabelCoreBrowser(labelSource));
console.log(`Wrote: ${OUT_LABEL_BROWSER}`);
```

(注: 既存 `buildEmitterBrowser` はそのまま残す。`buildBrowserGlobal` への内部委譲は既存ヘッダコメント文言が変わり emitter.browser.js のドリフトテストが落ちるため行わない)

- [ ] **Step 4: 生成を実行してテストが通ることを確認**

Run: `npm run build:browser` → `npm test`
Expected: `Wrote: ...label-core.browser.js` が出力され、全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add core/excel/build-browser.mjs core/excel/__tests__/build-browser.test.mjs core/label/label-core.browser.js
git commit -m "feat(label): label-core の browser build とドリフト検出テストを追加"
```

---

### Task 5: HTML版 — パーサーlpos・幾何中点・ラベル描画

**Files:**
- Modify: `stableblock.html`
  - L107-109 付近: `<script src>` 追加
  - L253: 接続パーサーに lpos 追加
  - L373-395: `extPt`/`bpath`/`straightPath`/`orthoPath`/`connPath` → `connPathInfo` に置換
  - L396 付近: `measureLabel` ヘルパー追加
  - L418-425, L433-441: 接続描画のラベル部分を書き換え

**Interfaces:**
- Consumes: `window.StableBlockLabel` の全関数(Task 4 の browser build)
- Produces:
  - `connPathInfo(fp, tp, fs, ts, route)` → `{d, mid}` — パス文字列と幾何中点(Task 6 と Task 10 が挙動に依存)
  - `measureLabel(text)` → number — `500 10px "IBM Plex Sans","Noto Sans JP",sans-serif` での幅
  - パース済み接続オブジェクトに `lpos` フィールドが増える

- [ ] **Step 1: script 読込を追加**

`stableblock.html` L109(`emitter.browser.js` の次)に追加:

```html
<script src="core/label/label-core.browser.js"></script>
```

- [ ] **Step 2: パーサーに lpos を追加**

L253 の connections.push の `route:` の直後に追加:

```js
lpos:window.StableBlockLabel.parseLpos(rest),
```

(変更後の該当部分: `...route:rest?.match(/route=(\S+)/)?.[1]||null,lpos:window.StableBlockLabel.parseLpos(rest),bidir:arrow==="-->",line:ln...`)

- [ ] **Step 3: パス生成を connPathInfo に置換**

L373-395 の `extPt`/`bpath`/`straightPath`/`orthoPath`/`connPath` の5関数を削除し、以下に置換:

```js
function connPathInfo(fp,tp,fs,ts,route){
  const m=route||lineMode;
  const SBL=window.StableBlockLabel;
  if(m==='straight')return{d:`M${fp.x},${fp.y} L${tp.x},${tp.y}`,mid:{x:(fp.x+tp.x)/2,y:(fp.y+tp.y)/2}};
  if(m==='ortho'){const pts=SBL.orthoPoints(fp,tp,fs,ts);return{d:'M'+pts.map(p=>`${p.x},${p.y}`).join(' L'),mid:SBL.polylineMidpoint(pts)};}
  const{c1,c2}=SBL.bezierControls(fp,tp,fs,ts);
  return{d:`M${fp.x},${fp.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${tp.x},${tp.y}`,mid:SBL.bezierMidpoint(fp,c1,c2,tp)};
}
```

- [ ] **Step 4: measureLabel ヘルパーを追加**

`esc()`(L396)の直後に追加:

```js
const _measureCtx=document.createElement('canvas').getContext('2d');
function measureLabel(t){_measureCtx.font='500 10px "IBM Plex Sans","Noto Sans JP",sans-serif';return _measureCtx.measureText(t).width;}
function connLabelSvg(c,mid){
  const L=window.StableBlockLabel.labelLayout(mid,c.lpos,measureLabel(c.label));
  return`<rect x="${L.bg.x}" y="${L.bg.y}" width="${L.bg.w}" height="${L.bg.h}" rx="${L.bg.rx}" fill="#FFFFFF" style="pointer-events:none"/>`+
    `<text x="${L.tx}" y="${L.ty}" font-size="10" fill="${c.color}" text-anchor="${L.anchor}" dominant-baseline="central" font-weight="500" style="pointer-events:none">${esc(c.label)}</text>`;
}
```

- [ ] **Step 5: 接続描画2箇所を書き換え**

通常接続(L420-425)を以下に変更(`connPath` 呼び出しを `connPathInfo` に、ラベル行を `connLabelSvg` に):

```js
  normalConns.forEach((c,i)=>{const p=ports[i];if(!p)return;const{fp,tp,fs,ts}=p;const dash=c.style==="dashed"?' stroke-dasharray="6,3"':'';const cHl=hlIds&&!isHighlightedConn(c,hlIds);const cop=cHl?dim:annotationEdit?annoDim:null;
    const ci=connections.indexOf(c);
    const pi=connPathInfo(fp,tp,fs,ts,c.route);
    s+=`<g${cop!==null?` opacity="${cop}"`:''}>`;
    s+=`<path d="${pi.d}" fill="none" stroke="${c.color}" stroke-width="${c.width}"${dash} marker-end="url(#a${ci})"${c.bidir?` marker-start="url(#a${ci})"`:''}/>`;
    if(c.label)s+=connLabelSvg(c,pi.mid);
    s+=`</g>`;});
```

注釈接続(L436-441)も同型に変更:

```js
    annoConns.forEach((c,i)=>{const p=annoPorts[i];if(!p)return;const{fp,tp,fs,ts}=p;
      const ci=connections.indexOf(c);
      const pi=connPathInfo(fp,tp,fs,ts,c.route);
      s+=`<g opacity="${annotationEdit?1:0.7}">`;
      s+=`<path d="${pi.d}" fill="none" stroke="${c.color}" stroke-width="${c.width}" stroke-dasharray="6,3" marker-end="url(#a${ci})"${c.bidir?` marker-start="url(#a${ci})"`:''}/>`;
      if(c.label)s+=connLabelSvg(c,pi.mid);
      s+=`</g>`;});
```

- [ ] **Step 6: ブラウザでスモーク確認**

`stableblock.html` をデフォルトブラウザで開き(`start stableblock.html`)、デフォルトサンプルの表示を確認:
- コンソールエラーがないこと
- `data -> log "payload"` のラベルが線の中点の**右**に白背景付きで出ること
- DSLに `lpos=center` を書き足すと中央+白背景になること

Expected: 上記3点OK(厳密な視覚検証は Task 10 の evaluator が実施)

- [ ] **Step 7: コミット**

```bash
git add stableblock.html
git commit -m "feat(html): 接続ラベルのlpos対応・幾何中点配置・白背景矩形を実装"
```

---

### Task 6: HTML版 — 接続セクションにラベル入力とlposボタンを追加

**Files:**
- Modify: `stableblock.html`
  - L646-655 付近: 接続セクション(既存接続あり分岐)にUI追加
  - L710 付近(`setLabel` の隣): `setConnLabel` 関数追加

**Interfaces:**
- Consumes: `setConnLabelInDsl`(window.StableBlockLabel)、既存 `setConnProp(a,b,prop,val)`、既存 `pushHistory()/parseDSL()/syncEditor()/renderSVG()/renderErrors()/renderStatus()`
- Produces: `setConnLabel(a, b, value)` — グローバル関数(onclick/oninput から参照)

- [ ] **Step 1: setConnLabel 関数を追加**

`setLabel`(L710)の直後に追加。**ECN-003 対策: renderProps を呼ばない**(setLabel と同型):

```js
function setConnLabel(a,b,v){pushHistory();dsl=window.StableBlockLabel.setConnLabelInDsl(dsl,a,b,v);parsed=parseDSL(dsl);syncEditor();renderSVG();renderErrors();renderStatus();}
```

- [ ] **Step 2: 接続セクションにUIを追加**

L648-650(反転/双方向ボタン行 `html+=\`</div>\`;` の直後、「線の色」の前)に追加:

```js
        html+=`<div class="prop-sub" style="margin-top:6px">ラベル</div><input class="prop-input" value="${esc(c.label)}" oninput="setConnLabel('${fa}','${ta}',this.value)" placeholder="(なし)">`;
        html+=`<div class="prop-sub" style="margin-top:6px">ラベル位置</div><div style="display:flex;gap:4px">${[['right','右'],['left','左'],['top','上'],['bottom','下'],['center','中央']].map(([v,l])=>`<button class="style-btn ${c.lpos===v?'active':''}" onclick="setConnProp('${fa}','${ta}','lpos','${v}')">${l}</button>`).join('')}</div>`;
```

(注: 位置ボタンは既存 `setConnProp` を再利用 → `refresh()` が走りボタンのactive状態も更新される。`center` も明示的に `lpos=center` を書き込む=スペック§5どおり)

- [ ] **Step 3: ブラウザで動作確認**

`stableblock.html` を開き:
1. ブロック2つを Shift+クリック → 接続セクションに「ラベル」入力欄と「ラベル位置」5ボタンが出る
2. ラベルに `テスト` と入力 → 1文字ごとにフォーカスが維持され(ECN-003)、SVGとDSLテキストに即反映
3. 位置ボタン「上」→ ラベルが線の上側に移動し、DSL行に `lpos=top` が付く
4. ラベルを全削除(空文字)→ DSL行から `"..."` が消え、接続線は残る(ECN-002)
5. Ctrl+Z でラベル変更が戻る

Expected: 5点すべてOK

- [ ] **Step 4: コミット**

```bash
git add stableblock.html
git commit -m "feat(html): 接続セクションにラベル入力欄とlpos位置ボタンを追加"
```

---

### Task 7: VSCode拡張 — label-core注入・パーサーlpos・ラベル描画

**Files:**
- Modify: `vscode-stableblock/src/extension.js`
  - L200-226 付近(Excel emitter 読込部): label-core 読込と注入を追加
  - L313: パーサーに lpos 追加
  - L332: `bP` → `pathInfo` に置換
  - L373, L387-388: 接続描画2箇所を書き換え

**Interfaces:**
- Consumes: `core/label/label-core.mjs`(実行時読込)、既存 `REPO_ROOT`、既存 `esc()`(Webview内)
- Produces(Webview内グローバル): `window.StableBlockLabel`(全export)、`pathInfo(f,t,fs,ts)` → `{d, mid}`、`measureLabel(t)` → number

**注意: 以下のWebview内コードはテンプレートリテラル内に埋め込むため、バッククォート・`${}` 禁止、文字列中の改行は `\\n` と記述する(既存規約)。**

- [ ] **Step 1: extension host 側で label-core を読み込み注入する**

Excel emitter 読込の try ブロック(L215 付近)と同じ場所に追加:

```js
  let labelCoreScript = '';
  try {
    labelCoreScript = fs.readFileSync(path.join(REPO_ROOT, 'core', 'label', 'label-core.mjs'), 'utf8');
  } catch (e) {
    console.error('[stableblock] Failed to load label-core:', e.message);
  }
  const labelCoreAsGlobals = labelCoreScript
    .replace(/^\s*export\s+(async\s+)?function\s+(\w+)/gm, '$1function $2')
    + '\n;window.StableBlockLabel = { extendPoint, bezierControls, bezierMidpoint, orthoPoints, polylineMidpoint, parseLpos, labelLayout, setConnLabelInDsl };';
```

`getWebviewContent` の返却HTML内、L264 の `<script>${emitterAsGlobals}<\/script>` の直後(メインWebviewスクリプトより前)に1行追加:

```
<script>${labelCoreAsGlobals}<\/script>
```

(既存と同様、閉じタグは `<\/script>` とエスケープする)

- [ ] **Step 2: Webviewパーサーに lpos を追加**

L313 の `cn.push({...})` に `lpos` を追加(`bidir:` の直前):

```js
lpos:window.StableBlockLabel.parseLpos(m[5]),
```

- [ ] **Step 3: bP を pathInfo に置換**

L332 の `bP` 関数を削除し、以下に置換:

```js
function pathInfo(f,t,fs,ts){var cc=window.StableBlockLabel.bezierControls(f,t,fs,ts);return{d:"M"+f.x+","+f.y+" C"+cc.c1.x+","+cc.c1.y+" "+cc.c2.x+","+cc.c2.y+" "+t.x+","+t.y,mid:window.StableBlockLabel.bezierMidpoint(f,cc.c1,cc.c2,t)};}
var _mCtx=document.createElement('canvas').getContext('2d');
function measureLabel(t){_mCtx.font='500 10px sans-serif';return _mCtx.measureText(t).width;}
function connLabelSvg(c,mid){
  var L=window.StableBlockLabel.labelLayout(mid,c.lpos,measureLabel(c.label));
  return'<rect x="'+L.bg.x+'" y="'+L.bg.y+'" width="'+L.bg.w+'" height="'+L.bg.h+'" rx="'+L.bg.rx+'" fill="#FFFFFF" style="pointer-events:none"/>'+
    '<text x="'+L.tx+'" y="'+L.ty+'" font-size="10" fill="'+c.color+'" text-anchor="'+L.anchor+'" dominant-baseline="central" font-weight="500" style="pointer-events:none">'+esc(c.label)+'</text>';
}
```

(拡張版パーサーは `route=` 非対応のため pathInfo はベジェのみでよい)

- [ ] **Step 4: 接続描画2箇所を書き換え**

通常接続(L373)の forEach 本体を変更 — `bP(p.fp,p.tp,p.fs,p.ts)` を `pi.d` に、ラベル `<text>` 生成を `connLabelSvg` に:

```js
  normalConns.forEach(function(c,i){var p=ports[i];if(!p)return;var d=c.style==="dashed"?' stroke-dasharray="6,3"':'';var cHl=hlIds&&!isHlConn(c,hlIds);var cOp=cHl?dim:annoEdit?aDim:null;var ci=cn.indexOf(c);var sOp=searchQ&&!matchSearch(c)?' opacity="0.2"':'';var pi=pathInfo(p.fp,p.tp,p.fs,p.ts);s+='<g'+(cOp!==null?' opacity="'+cOp+'"':sOp)+'><path d="'+pi.d+'" fill="none" stroke="'+c.color+'" stroke-width="'+c.width+'"'+d+' marker-end="url(#a'+ci+')"'+(c.bidir?' marker-start="url(#a'+ci+')"':'')+'/>';if(c.label)s+=connLabelSvg(c,pi.mid);s+='</g>';});
```

注釈接続(L384-389)も同型に変更:

```js
    annoConns.forEach(function(c,i){var p=annoPorts[i];if(!p)return;
      var ci=cn.indexOf(c);
      var pi=pathInfo(p.fp,p.tp,p.fs,p.ts);
      s+='<g opacity="'+(annoEdit?1:0.7)+'">';
      s+='<path d="'+pi.d+'" fill="none" stroke="'+c.color+'" stroke-width="'+c.width+'" stroke-dasharray="6,3" marker-end="url(#a'+ci+')"'+(c.bidir?' marker-start="url(#a'+ci+')"':'')+'/>';
      if(c.label)s+=connLabelSvg(c,pi.mid);
      s+='</g>';});
```

- [ ] **Step 5: スモーク確認(拡張開発ホスト)**

```bash
cd vscode-stableblock && npm install && npx vsce package --allow-missing-repository
code --install-extension stableblock-0.6.0.vsix
```

`.sb` ファイル(`a -> b "payload"` を含む)を開き `Ctrl+Shift+V`:
- プレビューにラベルが中点の右+白背景で表示される
- Webview DevTools(Developer: Open Webview Developer Tools)にエラーがない

Expected: 両方OK

- [ ] **Step 6: コミット**

```bash
git add vscode-stableblock/src/extension.js
git commit -m "feat(vscode): Webviewにlabel-core注入、接続ラベルのlpos対応と白背景を実装"
```

---

### Task 8: VSCode拡張 — 接続セクションにラベル入力とlposボタンを追加

**Files:**
- Modify: `vscode-stableblock/src/extension.js`
  - L492 付近(Flip/Bidir 行の直後): UI追加
  - L540 付近(`sLb` の隣): `sCLb` 関数追加

**Interfaces:**
- Consumes: `window.StableBlockLabel.setConnLabelInDsl`、既存 `setCP(a,b,prop,val)`、`pushH()/parseDSL()/render()/notify()`、`esc()`
- Produces(Webview内グローバル): `sCLb(a, b, value)`

**注意: テンプレートリテラル内のため `\\'` エスケープ規約(既存の onclick と同じ)に従う。**

- [ ] **Step 1: sCLb 関数を追加**

`sLb`(L540)の直後に追加。**ECN-003 対策: props() を呼ばない**:

```js
function sCLb(a,b,v){pushH();dsl=window.StableBlockLabel.setConnLabelInDsl(dsl,a,b,v);parsed=parseDSL(dsl);render();notify();}
```

- [ ] **Step 2: 接続セクションにUIを追加**

L492(Flip/Bidir ボタン行)の直後、Line Color の前に追加:

```js
        mh+='<div class="pl" style="font-size:9px;margin-top:4px">Label</div><input class="pi" style="width:100%" value="'+esc(cn.label)+'" oninput="sCLb(\\''+fa+'\\',\\''+ta+'\\',this.value)" placeholder="(none)">';
        mh+='<div class="pl" style="font-size:9px;margin-top:4px">Label Pos</div><div style="display:flex;gap:3px">'+[["right","右"],["left","左"],["top","上"],["bottom","下"],["center","中"]].map(function(pv){return'<button class="sbtn'+(cn.lpos===pv[0]?' act':'')+'" onclick="setCP(\\''+fa+'\\',\\''+ta+'\\',\\'lpos\\',\\''+pv[0]+'\\')">'+pv[1]+'</button>'}).join('')+'</div>';
```

(位置ボタンは既存 `setCP` を再利用 → `go()` + `notify()` が走り active 状態も更新される)

- [ ] **Step 3: 動作確認(拡張開発ホスト)**

再パッケージ・再インストール(Task 7 Step 5 と同じコマンド)後、`.sb` プレビューで:
1. ブロック2つを Shift+クリック → Label 入力欄と Label Pos 5ボタンが出る
2. ラベル入力中フォーカス維持、エディタ側DSLに即時反映(双方向同期)
3. 位置ボタンで DSL に `lpos=...` が付き表示が移動
4. 空文字でラベルのみ除去・接続は残る

Expected: 4点すべてOK

- [ ] **Step 4: コミット**

```bash
git add vscode-stableblock/src/extension.js
git commit -m "feat(vscode): 接続セクションにラベル入力欄とlpos位置ボタンを追加"
```

---

### Task 9: MCPサーバー影響確認(読み取りのみ)

**Files:**
- 変更なし(確認のみ)。影響があった場合のみ ISSUES として報告

- [ ] **Step 1: mcp-server の接続行の扱いを確認**

```bash
grep -rn -- "->" mcp-server/ --include="*.py" | head -20
```

確認観点: mcp-server が接続行を独自の正規表現で**解析**しているか(テンプレート**生成**のみなら影響なし)。`lpos=` 付き接続行を不正扱いするコードがなければOK。

- [ ] **Step 2: 結果を計画書に記録**

このファイル末尾の「実施ログ」節に結果を1行追記(例: 「mcp-server はDSL生成のみで解析なし→影響なし」)。解析していて lpos で壊れる場合は、修正タスクを追加せず Orchestrator/ユーザーに報告する。

- [ ] **Step 3: コミット(記録追記時のみ)**

```bash
git add docs/superpowers/plans/2026-07-13-connection-label-position.md
git commit -m "docs(plan): MCPサーバー影響確認の結果を記録"
```

---

### Task 10: evaluator による視覚検証(HTML版) — 視覚検証ゲート

**Files:**
- Create: `.eval/connection-label/`(evaluator が生成する report.md + スクリーンショット)

**Interfaces:**
- Consumes: Task 5-6 完了済みの `stableblock.html`(`file:///E:/00_Git/01_StatbleBlock/stableblock.html` で開く。devサーバー不要)

- [ ] **Step 1: evaluator エージェントを起動**

evaluator に以下を検証させる(スクリーンショット証拠必須。**GREENの自動テストだけではPASS禁止**):

検証用DSL(エディタに貼り付け):

```
@canvas width=960 height=640 grid=20
block a "A" at 2,2 size 8x3
block b "B" at 30,2 size 8x3
block c "C" at 2,12 size 8x3
block d "D" at 30,12 size 8x3
block e "E" at 16,22 size 8x3
a -> b "デフォルト右"
c -> d "中央ラベル" lpos=center
a -> c "左" lpos=left
b -> d "上" lpos=top route=straight
c -> e "下です" lpos=bottom route=ortho
```

チェックリスト:
1. 5方向すべてのラベルが指定位置に白背景付きで表示される(位置未指定=右)
2. `route=straight` / `route=ortho` でもラベルが線の幾何中点基準に付く(弦中点への退行がない)
3. 日本語ラベルで背景矩形がテキスト幅に一致(はみ出し・不足なし)
4. ブロック2選択→ラベル入力欄で1文字ずつ入力してもフォーカスが保持される(ECN-003)
5. ラベル空文字化で接続線が残る(ECN-002)
6. 位置ボタン押下でDSLに `lpos=` が書き込まれ、ボタンのactive表示が追従する
7. ツールバーの線種切替(曲線/直線/直角)でもラベルが追従する

- [ ] **Step 2: report.md が PASS であることを確認**

Expected: `.eval/connection-label/report.md` が全項目PASS+スクリーンショット添付。FAILがあれば該当タスクに戻って修正(最大ループは実行スキルの規約に従う)

- [ ] **Step 3: コミット**

```bash
git add .eval/connection-label/
git commit -m "test(eval): 接続ラベル位置指定・背景の視覚検証エビデンス"
```

---

### Task 11: VSIXパッケージとユーザー受入準備

**Files:**
- Modify: `CHANGELOG.md`(変更概要を追記)

- [ ] **Step 1: 全テスト+ビルド最終確認**

```bash
npm test && npm run build:browser && git status --short
```

Expected: 全テストPASS、build:browser 後に差分なし(ドリフトなし)

- [ ] **Step 2: CHANGELOG.md に追記**

既存のフォーマットに合わせ、Unreleased(または最新バージョン節)に:

```markdown
- 接続線ラベルをプロパティパネルから入力可能に(HTML版/VSCode拡張)
- 接続線ラベルの位置指定 `lpos=right|left|top|bottom|center` を追加(デフォルト: 右)
- 接続線ラベルに白背景矩形を追加、曲線・直角経路でも線上の幾何中点に配置
```

- [ ] **Step 3: VSIX を再パッケージ**

```bash
cd vscode-stableblock && npx vsce package --allow-missing-repository
```

Expected: `stableblock-0.6.0.vsix` 生成成功(バージョンbumpはユーザー承認後の `./bump-version.sh` に委ねる)

- [ ] **Step 4: コミットとユーザー受入依頼**

```bash
git add CHANGELOG.md
git commit -m "docs: 接続ラベル機能のCHANGELOG追記"
```

ユーザーへの受入チェックリスト(拡張は実VSCodeでの手動確認が必要なため):
1. VSIX をインストールして `.sb` プレビューでラベル入力・位置変更・白背景を確認
2. 既存の自作 `.sb` 図でデフォルト右への表示変化が許容範囲か確認
3. 受入OKなら: PRマージ承認(PR番号明示)、ADRドラフト採番承認、`/ecn-from-git` によるECN化

---

## 実施ログ

(実装時に記録を追記する)

## Self-Review 結果

- スペック§1-§7 の全要件がタスクにマップされていることを確認(§1→T1-T5/T7、§2→T1/T5/T7、§3→T2/T5/T7、§4→T2/T5/T7、§5→T3/T6/T8、§6→T9/スコープ外明記、§7→T1-T4単体+T10視覚+T11受入)
- プレースホルダなし(全ステップに実コード・実コマンド・期待値を記載)
- 型・関数名の整合を確認(`connPathInfo`/`pathInfo`/`connLabelSvg`/`sCLb`/`setConnLabel`/`labelLayout` の引数・返却が Interfaces 節と一致)
