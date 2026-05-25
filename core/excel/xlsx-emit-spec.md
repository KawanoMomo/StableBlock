# StableBlock → Xlsx Drawing XML Emit Spec

## 目的
StableBlock の AST を、Excel 互換の OOXML Drawing XML に変換する正典。
JS 実装 (`emitter.js`) と Python 実装（Plan 2 で作成）は本仕様に従う。

## 単位系
- DSL のグリッド座標 1 = canvas.grid ピクセル（デフォルト 20px）
- 1 px = 9525 EMU
- すべての座標・サイズは EMU で出力

## XML ルート
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <!-- 子要素: <xdr:absoluteAnchor> を Z-order 順に列挙 -->
</xdr:wsDr>
```

## シェイプ ID
- 1 から開始する連番（unique）
- `name` 属性は `<type>:<dsl-id>` 形式（例: `block:ui`, `group:app`, `note:memo`, `conn:0`）

## Block

DSL: `block ui "UI" at 1,1 size 5x3 color=#3B82F6 text=#FFFFFF round=4`

Emit:
```xml
<xdr:absoluteAnchor>
  <xdr:pos x="190500" y="190500"/>           <!-- 1grid * 20px * 9525 -->
  <xdr:ext cx="952500" cy="571500"/>          <!-- 5grid * 20 * 9525, 3grid * 20 * 9525 -->
  <xdr:sp macro="" textlink="">
    <xdr:nvSpPr>
      <xdr:cNvPr id="2" name="block:ui"/>
      <xdr:cNvSpPr/>
    </xdr:nvSpPr>
    <xdr:spPr>
      <a:xfrm><a:off x="0" y="0"/><a:ext cx="952500" cy="571500"/></a:xfrm>
      <a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 15000"/></a:avLst></a:prstGeom>
      <a:solidFill><a:srgbClr val="3B82F6"/></a:solidFill>
      <a:ln><a:noFill/></a:ln>
    </xdr:spPr>
    <xdr:txBody>
      <a:bodyPr wrap="square" anchor="ctr"><a:normAutofit/></a:bodyPr>
      <a:lstStyle/>
      <a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ja-JP" sz="1100"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:latin typeface="Calibri"/><a:ea typeface="Yu Gothic UI"/></a:rPr><a:t>UI</a:t></a:r></a:p>
    </xdr:txBody>
  </xdr:sp>
  <xdr:clientData/>
</xdr:absoluteAnchor>
```

ルール:
- `round=N` → `<a:gd name="adj" fmla="val M"/>`, M = round(N / min(w*grid, h*grid) * 100000) を上限 50000
  - SVG の `rx` ピクセル値に対応。短辺ピクセル長に対する比率として OOXML adj を算出
- `\n`（2 文字: バックスラッシュ + n）または改行コードでラベルを分割し、各行を別々の `<a:p>` に格納
- `<a:bodyPr>` 内に `<a:normAutofit/>` を入れて、テキスト溢れ時に Excel が自動でフォントサイズ縮小
- `<a:rPr>` 内に `<a:latin typeface="Calibri"/>` と `<a:ea typeface="Yu Gothic UI"/>` を明示
- `border=#XXX` がある → `<a:ln><a:solidFill><a:srgbClr val="XXX"/></a:solidFill></a:ln>`
- フォントサイズは固定 1100 (= 11pt * 100)

## Group

DSL: `group app "Application" at 1,1 size 20x10 color=#EEF2FF border=#818CF8`

Emit:
```xml
<xdr:absoluteAnchor>
  <xdr:pos x="190500" y="190500"/>
  <xdr:ext cx="3810000" cy="1905000"/>
  <xdr:sp macro="" textlink="">
    <xdr:nvSpPr>
      <xdr:cNvPr id="1" name="group:app"/>
      <xdr:cNvSpPr/>
    </xdr:nvSpPr>
    <xdr:spPr>
      <a:xfrm><a:off x="0" y="0"/><a:ext cx="3810000" cy="1905000"/></a:xfrm>
      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      <a:solidFill><a:srgbClr val="EEF2FF"><a:alpha val="40000"/></a:srgbClr></a:solidFill>
      <a:ln><a:solidFill><a:srgbClr val="818CF8"/></a:solidFill></a:ln>
    </xdr:spPr>
    <xdr:txBody>
      <a:bodyPr wrap="square" anchor="t"/>
      <a:lstStyle/>
      <a:p><a:pPr algn="l"/><a:r><a:rPr lang="ja-JP" sz="900" b="1"><a:solidFill><a:srgbClr val="475569"/></a:solidFill><a:latin typeface="Calibri"/><a:ea typeface="Yu Gothic UI"/></a:rPr><a:t>Application</a:t></a:r></a:p>
    </xdr:txBody>
  </xdr:sp>
  <xdr:clientData/>
</xdr:absoluteAnchor>
```

ルール:
- 塗りつぶしは alpha=40000 (40% = 透過度 60%)
- ラベルは左上揃え (`anchor="t"`, `algn="l"`)、太字 (`b="1"`)、9pt、テキスト色 `#475569` 固定

## Note (注釈)

Block と同じ矩形シェイプ構造だが、以下の違いを `buildBlockShape` の `opts` で表現:

- `namePrefix: 'note'` — `name="note:..."`
- `fillAlpha: 70000` — 塗りつぶしに `<a:alpha val="70000"/>` を入れて 70% 透過（SVG `opacity=0.7` に合わせる）
- `dashedBorder: true` — `<a:ln>` 内に `<a:prstDash val="dash"/>` を追加
- `defaultBorderColor: 'D97706'` — `borderColor` 未指定時のフォールバック（SVG レンダラのデフォルトと一致）

Z-order は最上層。

## Connection

DSL: `ui -> core "request"`

接続線本体（端点の EMU 座標を `(x1,y1)`, `(x2,y2)` とする）:
```xml
<xdr:absoluteAnchor>
  <xdr:pos x="MIN_X" y="MIN_Y"/>
  <xdr:ext cx="ABS_DX" cy="ABS_DY"/>
  <xdr:cxnSp macro="">
    <xdr:nvCxnSpPr>
      <xdr:cNvPr id="N" name="conn:I"/>
      <xdr:cNvCxnSpPr/>
    </xdr:nvCxnSpPr>
    <xdr:spPr>
      <a:xfrm flipH="FLIPH" flipV="FLIPV"><a:off x="0" y="0"/><a:ext cx="ABS_DX" cy="ABS_DY"/></a:xfrm>
      <a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom>
      <a:ln w="LW"><a:solidFill><a:srgbClr val="64748B"/></a:solidFill><a:tailEnd type="triangle"/></a:ln>
    </xdr:spPr>
  </xdr:cxnSp>
  <xdr:clientData/>
</xdr:absoluteAnchor>
```

`MIN_X = min(x1,x2)`, `MIN_Y = min(y1,y2)`, `ABS_DX = |x2-x1|`, `ABS_DY = |y2-y1|`,
`FLIPH = (x1 > x2) ? "true" : "false"`,
`FLIPV = (y1 > y2) ? "true" : "false"`,
`LW = width * 9525` (EMU)。

ルール:
- `-->` (bidir) → `<a:headEnd type="triangle"/>` も追加
- `style=dashed` → `<a:ln>` 内に `<a:prstDash val="dash"/>` を追加
- `color=#XXX` → `<a:srgbClr val="XXX"/>` を上書き
- ラベル付き → 別 anchor で TextBox を線の中点に配置（後述）

## Connection ラベル TextBox

線にラベルが付いている場合、独立シェイプとして中点に配置。
```xml
<xdr:absoluteAnchor>
  <xdr:pos x="MID_X" y="MID_Y"/>
  <xdr:ext cx="500000" cy="200000"/>
  <xdr:sp macro="" textlink="">
    <xdr:nvSpPr>
      <xdr:cNvPr id="N" name="connlabel:I"/>
      <xdr:cNvSpPr txBox="1"/>
    </xdr:nvSpPr>
    <xdr:spPr>
      <a:xfrm><a:off x="0" y="0"/><a:ext cx="500000" cy="200000"/></a:xfrm>
      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
      <a:ln><a:noFill/></a:ln>
    </xdr:spPr>
    <xdr:txBody>
      <a:bodyPr wrap="square" anchor="ctr"/>
      <a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ja-JP" sz="900"><a:solidFill><a:srgbClr val="64748B"/></a:solidFill><a:latin typeface="Calibri"/><a:ea typeface="Yu Gothic UI"/></a:rPr><a:t>LABEL</a:t></a:r></a:p>
    </xdr:txBody>
  </xdr:sp>
  <xdr:clientData/>
</xdr:absoluteAnchor>
```

## 端点ルーティング

ECN-006 接続面選択アルゴリズムを SVG レンダラからそのまま移植。

1. **`getSide(from, to)`**: from/to ブロック間の上下左右のギャップを比較し、最大ギャップ方向の辺ペアを選ぶ
   - 例: 横並びなら `{ fs: 'right', ts: 'left' }`、縦並びなら `{ fs: 'bottom', ts: 'top' }`
2. **`computeAllPorts(connections, blockMap, gridPx)`**: 全接続を一括処理。同じブロックの同じ辺に複数接続がある場合、相手側の中心座標でソートして辺上に等間隔配置（pad=0.2）
3. **`portPos(b, side, idx, total)`**: 辺上の port 位置を計算。`total=1` なら中点、複数なら 20%〜80% 区間で等間隔

実装: `getSide`, `portPos`, `computeAllPorts` を `emitter.js` から export。`computeConnectionEndpoints` (legacy 1接続版) も維持。

## XML エスケープ
すべてのテキスト値（label, id）は `&` `<` `>` `"` `'` をエスケープする:
- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`
- `'` → `&apos;`

## Z-order
1. Groups (DSL 出現順)
2. Connections (DSL 出現順)
3. Connection labels (DSL 出現順)
4. Blocks (DSL 出現順)
5. Notes (DSL 出現順)

## ID 採番
`cNvPr id` は 1 から始まる連番。Z-order 順で振る。

## ブラウザ向け派生ファイル

`file://` で `<script type="module">` import と `fetch()` がブロックされるため、HTML 版用に派生ファイルを git にコミットする:

- `core/excel/template-inline.js`: `window.StableBlockTemplateFiles = {...}` を設定（テンプレート 7 ファイル分の文字列を JSON 埋め込み）
- `core/excel/emitter.browser.js`: emitter.js から `export` キーワードを除去し、末尾に `window.StableBlockExcel = { 全 export 関数名 }` を追加

これらは `core/excel/build-browser.mjs` で自動生成され、`npm run build:browser` で再生成可能。drift 検出テスト (`__tests__/build-browser.test.mjs`) でソースと出力の整合性を CI 担保する。
