# ADR ドラフト: 図の描画を core/render に寄せ、書き出しは画面の状態を持ち込まない

- 状態: ドラフト(採番は人間)
- 関連: BLK-owner-20260926-0609-1、principles「同じ本文は、どの画面・どの書き出しでも同じ絵になる」「GUI はテキストに無い状態を持たない」

## コンテキスト
HTML 版(`stableblock.html` の renderSVG)と VSCode 拡張(`extension.js` の render)が同じ SVG をそれぞれ手で組み立てていた。
SVG / PNG / 透過PNG / PNGをコピー は画面の `#svg-wrap svg` をそのまま直列化し、大きさを表示倍率(`zoom` / `zm`)から作っていたため、
選択の枠・リサイズハンドル・グリッドの点・検索や「未接続を薄く」の薄めが画像に入り、画素数が窓の大きさと「+」「−」で変わった。

## 検討した案
1. 書き出し時に画面の SVG を複製し、ハンドルやグリッドを DOM で取り除く — 取り除き漏れ(新しい画面状態が増えるたび)が再発する。拡張と二重実装のまま
2. 書き出し専用の描画関数を別に書く — 画面と書き出しで絵がずれる余地が残る
3. **描画を 1 つの純粋関数(core/render の renderSvg)にし、画面の状態は引数 view で渡す。書き出し(exportSvg)は view を固定値にして呼ぶ** — 採用

## 決定
- `core/render/render-core.mjs`: `renderSvg(parsed, view, L, measure)` / `exportSvg(parsed, L, measure, font)` / `exportPngSize(canvas)`。
  端点・線の形・ラベルの置き場所は core/label の関数を引数 L で受ける(browser 版は他の core を import できないため)
- 書き出しは選択・ハンドル・スナップガイド・グリッド・薄め・注釈の表示切替・表示倍率を持ち込まない。注釈は本文どおり全部描く。
  SVG の大きさは @canvas の寸法、PNG は @canvas × 2(固定)
- HTML 版は `core/render/render-core.browser.js`(build-browser.mjs が生成)、拡張は他の core と同じく .mjs をインライン埋め込み
- 画面の描画も同じ関数を使うので、検索の薄めは両方で接続にも効く(拡張の挙動に揃えた)

## 影響
- 書き出した画像の大きさが変わる(表示倍率 91% で 1747x946 だった PNG が 1920x1040 に固定)
- フォントは各画面のまま(HTML 版は IBM Plex Sans / Noto Sans JP、拡張は sans-serif)。ラベル幅の測定もそれぞれの画面の canvas で行う
