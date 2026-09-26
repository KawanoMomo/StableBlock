/**
 * StableBlock VSCode Extension
 *
 * Provides syntax highlighting and interactive webview preview for .sb files.
 * The webview contains a full editor (same logic as stableblock.html) with
 * bidirectional sync: editor changes update preview, preview drag/edit updates editor.
 *
 * Extension host (this file, Node.js):
 *   - activate(): registers commands (preview, undo, redo, copy, paste, diff) and the ID rename (F2) / references (Shift+F12) providers
 *   - getWebviewContent(): returns HTML with embedded JS for the preview panel
 *   - getDiffContent(): returns side-by-side visual diff HTML
 *
 * Webview (embedded JS, ES5 style, inside template literal):
 *   - parseDSL, render, props, go — same architecture as stableblock.html
 *   - Communicates with extension via vscodeApi.postMessage()
 */
const vscode = require("vscode");

function activate(context) {
  let currentPanel = undefined;
  let isUpdatingFromWebview = false;

  // Shortcut commands forwarded to webview (VSCode intercepts these before they reach the webview)
  const fwd = (action) => { if (currentPanel) currentPanel.webview.postMessage({ type: action }); };
  context.subscriptions.push(
    vscode.commands.registerCommand("stableblock.undo", () => fwd("undo")),
    vscode.commands.registerCommand("stableblock.redo", () => fwd("redo")),
    vscode.commands.registerCommand("stableblock.selectAll", () => fwd("selectAll")),
    vscode.commands.registerCommand("stableblock.copy", () => fwd("copy")),
    vscode.commands.registerCommand("stableblock.cut", () => fwd("cut")),
    vscode.commands.registerCommand("stableblock.paste", () => fwd("paste"))
  );

  const cmd = vscode.commands.registerCommand("stableblock.preview", () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    if (currentPanel) {
      currentPanel.reveal(vscode.ViewColumn.Beside);
    } else {
      currentPanel = vscode.window.createWebviewPanel(
        "stableblockPreview", "StableBlock Preview", vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      currentPanel.onDidDispose(() => { currentPanel = undefined; }, null, context.subscriptions);
      currentPanel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type === "dslUpdate") {
          const ed = vscode.window.activeTextEditor;
          if (ed && (ed.document.languageId === "stableblock" || ed.document.fileName.match(/\.(sb|stableblock)$/))) {
            isUpdatingFromWebview = true;
            const fullRange = new vscode.Range(ed.document.positionAt(0), ed.document.positionAt(ed.document.getText().length));
            ed.edit((eb) => { eb.replace(fullRange, msg.dsl); }).then(() => { isUpdatingFromWebview = false; });
          }
        }
        if (msg.type === "exportSVG") {
          const uri = await vscode.window.showSaveDialog({ filters: { "SVG": ["svg"] }, defaultUri: vscode.Uri.file("diagram.svg") });
          if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(msg.data, "utf-8"));
            vscode.window.showInformationMessage("SVG saved: " + uri.fsPath);
          }
        }
        if (msg.type === "exportPNG") {
          const uri = await vscode.window.showSaveDialog({ filters: { "PNG": ["png"] }, defaultUri: vscode.Uri.file("diagram.png") });
          if (uri) {
            const buf = Buffer.from(msg.data.replace(/^data:image\/png;base64,/, ""), "base64");
            await vscode.workspace.fs.writeFile(uri, buf);
            vscode.window.showInformationMessage("PNG saved: " + uri.fsPath);
          }
        }
        if (msg.type === "exportXlsx") {
          const uri = await vscode.window.showSaveDialog({
            filters: { "Excel": ["xlsx"] },
            defaultUri: vscode.Uri.file("diagram.xlsx")
          });
          if (uri) {
            const buf = Buffer.from(msg.data, 'base64');
            await vscode.workspace.fs.writeFile(uri, buf);
            vscode.window.showInformationMessage("Excel ファイルを書き出しました: " + uri.fsPath);
          }
        }
        if (msg.type === "exportMmd") {
          const uri = await vscode.window.showSaveDialog({ filters: { "Mermaid": ["mmd", "md"] }, defaultUri: vscode.Uri.file("diagram.mmd") });
          if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(msg.data, "utf-8"));
            vscode.window.showInformationMessage("Mermaid saved: " + uri.fsPath);
          }
        }
        if (msg.type === "info") {
          vscode.window.showInformationMessage(msg.text);
        }
        if (msg.type === "exportDrops") {
          // 書き出し先の記法で表せず落ちたもの(core/mermaid・core/excel が列挙)。.sb には残っている
          vscode.window.showWarningMessage(msg.format + " に書き出せなかったもの(" + msg.items.length + " 件): " + msg.items.join(" / "));
        }
      }, null, context.subscriptions);
    }

    const updatePreview = () => {
      if (isUpdatingFromWebview) return;
      const doc = vscode.window.activeTextEditor?.document;
      if (doc && (doc.languageId === "stableblock" || doc.fileName.match(/\.(sb|stableblock)$/))) {
        currentPanel.webview.html = getWebviewContent(doc.getText(), doc.uri.fsPath);
      }
    };
    updatePreview();

    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (!isUpdatingFromWebview && vscode.window.activeTextEditor && e.document === vscode.window.activeTextEditor.document) updatePreview();
      }),
      vscode.window.onDidChangeActiveTextEditor(() => updatePreview())
    );
  });
  context.subscriptions.push(cmd);

  // Visual diff command
  const diffCmd = vscode.commands.registerCommand("stableblock.diffPreview", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const doc = editor.document;
    if (!doc.fileName.match(/\.(sb|stableblock)$/)) return;
    const currentText = doc.getText();
    // Get HEAD version via git
    try {
      const cp = require("child_process");
      const dir = require("path").dirname(doc.uri.fsPath);
      const rel = require("path").relative(dir, doc.uri.fsPath).replace(/\\/g, "/");
      const headText = cp.execSync(`git show HEAD:${rel}`, { cwd: dir, encoding: "utf-8" });
      const panel = vscode.window.createWebviewPanel(
        "stableblockDiff", "StableBlock Diff", vscode.ViewColumn.Active,
        { enableScripts: true }
      );
      panel.webview.html = getDiffContent(headText, currentText);
    } catch (e) {
      vscode.window.showWarningMessage("No git history found for this file");
    }
  });
  context.subscriptions.push(diffCmd);

  // ID の改名(F2「シンボルの名前変更」)と参照一覧(Shift+F12「すべての参照を検索」)。ワークスペースの全 .sb をまたいで、
  // CLI(npm run check -- --rename / --refs)と同じ core/label の planRename / findIdInDsl を使う。書き換えるのは定義行と接続の from / to だけ
  const idAt = async (doc, pos) => {
    const core = await loadLabelCore();
    const span = core.idSpansInLine(doc.lineAt(pos.line).text).find((x) => pos.character >= x.start && pos.character <= x.end);
    return span ? { core, id: span.id, range: new vscode.Range(pos.line, span.start, pos.line, span.end) } : null;
  };
  const workspaceSb = async (doc) => {
    const uris = await vscode.workspace.findFiles("**/*.{sb,stableblock}", "**/node_modules/**");
    if (!uris.some((u) => u.toString() === doc.uri.toString())) uris.push(doc.uri);
    return Promise.all(uris.map(async (uri) => ({ uri, path: vscode.workspace.asRelativePath(uri), text: (await vscode.workspace.openTextDocument(uri)).getText() })));
  };
  context.subscriptions.push(
    vscode.languages.registerRenameProvider({ language: "stableblock" }, {
      async prepareRename(doc, pos) {
        const at = await idAt(doc, pos);
        if (!at) throw new Error("ID(定義行の 2 語目か、接続の両端)の上で F2 を押す");
        return { range: at.range, placeholder: at.id };
      },
      async provideRenameEdits(doc, pos, newName) {
        const at = await idAt(doc, pos);
        if (!at) throw new Error("ID(定義行の 2 語目か、接続の両端)の上で F2 を押す");
        const files = await workspaceSb(doc);
        const plan = at.core.planRename(files, at.id, newName);
        if (plan.error) throw new Error(plan.error);
        const edit = new vscode.WorkspaceEdit();
        for (const c of plan.changes) {
          const f = files.find((x) => x.path === c.path);
          for (const l of c.lines) edit.replace(f.uri, new vscode.Range(l.line - 1, 0, l.line - 1, l.before.length), l.after);
        }
        return edit;
      },
    }),
    vscode.languages.registerReferenceProvider({ language: "stableblock" }, {
      async provideReferences(doc, pos) {
        const at = await idAt(doc, pos);
        if (!at) return [];
        const out = [];
        for (const f of await workspaceSb(doc)) {
          for (const r of at.core.findIdInDsl(f.text, at.id)) out.push(new vscode.Location(f.uri, new vscode.Range(r.line - 1, 0, r.line - 1, r.text.length)));
        }
        return out;
      },
    })
  );
}

// core/label/label-core.mjs(ESM)を拡張ホストで読む。リポジトリ内レイアウトと VSIX 同梱レイアウト(prepackage-core.js がコピー)の両方
let labelCorePromise;
function loadLabelCore() {
  if (!labelCorePromise) {
    const path = require("path"), fs = require("fs"), { pathToFileURL } = require("url");
    const roots = [path.resolve(__dirname, "..", ".."), path.resolve(__dirname, "..")];
    const root = roots.find((r) => fs.existsSync(path.join(r, "core", "label", "label-core.mjs"))) || roots[0];
    labelCorePromise = import(pathToFileURL(path.join(root, "core", "label", "label-core.mjs")).href);
  }
  return labelCorePromise;
}

function getDiffContent(oldDsl, newDsl) {
  const oldJson = JSON.stringify(oldDsl);
  const newJson = JSON.stringify(newDsl);
  return `<!DOCTYPE html><html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1e1e1e;color:#d4d4d4;font-family:sans-serif;display:flex;flex-direction:column;height:100vh}
.header{padding:8px 12px;font-size:12px;font-weight:600;border-bottom:1px solid #444;display:flex;gap:20px}
.header span{color:#888}
.container{display:flex;flex:1;overflow:auto}
.pane{flex:1;padding:8px;overflow:auto;border-right:1px solid #333}
.pane:last-child{border-right:none}
.label{font-size:11px;font-weight:700;padding:4px 8px;margin-bottom:4px}
.old .label{color:#f87171}
.new .label{color:#34d399}
</style></head><body>
<div class="header"><span>StableBlock Visual Diff</span><span>HEAD (left) vs Current (right)</span></div>
<div class="container">
<div class="pane old"><div class="label">HEAD</div><div id="old-svg"></div></div>
<div class="pane new"><div class="label">Current</div><div id="new-svg"></div></div>
</div>
<script>
var COLORS=["#6366F1","#8B5CF6","#EC4899","#EF4444","#F59E0B","#D97706","#22C55E","#16A34A","#06B6D4","#3B82F6","#64748B","#DC2626"];
function esc(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function parseDSL(t){
  var ls=t.split("\\n"),cv={width:960,height:640,grid:20},bl=[],gr=[],cn=[];
  for(var i=0;i<ls.length;i++){
    var r=ls[i].trim();if(!r||r[0]==='#')continue;
    if(r.startsWith("@canvas")){var w=r.match(/width=(\\d+)/),h=r.match(/height=(\\d+)/),g=r.match(/grid=(\\d+)/);if(w)cv.width=+w[1];if(h)cv.height=+h[1];if(g)cv.grid=+g[1];continue;}
    var m=r.match(/^block\\s+(\\S+)\\s+"((?:\\\\"|[^"])*)"\\s+at\\s+([\\d.]+),([\\d.]+)\\s+size\\s+([\\d.]+)x([\\d.]+)(.*)/);
    if(m){bl.push({id:m[1],label:m[2].replace(/\\\\"/g,'"'),x:+m[3],y:+m[4],w:+m[5],h:+m[6],color:(m[7].match(/color=(\\S+)/)||[])[1]||"#3B82F6",textColor:(m[7].match(/text=(\\S+)/)||[])[1]||"#FFFFFF",round:+((m[7].match(/round=(\\d+)/)||[])[1]||"4")});continue;}
    m=r.match(/^group\\s+(\\S+)\\s+"((?:\\\\"|[^"])*)"\\s+at\\s+([\\d.]+),([\\d.]+)\\s+size\\s+([\\d.]+)x([\\d.]+)(.*)/);
    if(m){gr.push({id:m[1],label:m[2].replace(/\\\\"/g,'"'),x:+m[3],y:+m[4],w:+m[5],h:+m[6],color:(m[7].match(/color=(\\S+)/)||[])[1]||"#F3F4F6",borderColor:(m[7].match(/border=(\\S+)/)||[])[1]||"#9CA3AF"});continue;}
    m=r.match(/^(\\S+)\\s+(-->|->)\\s+(\\S+)/);
    if(m){cn.push({from:m[1],to:m[3],bidir:m[2]==="-->"});continue;}
  }
  return{canvas:cv,blocks:bl,groups:gr,connections:cn};
}
function renderMiniSVG(p){
  var g=p.canvas.grid,s='<svg width="100%" viewBox="0 0 '+p.canvas.width+' '+p.canvas.height+'" xmlns="http://www.w3.org/2000/svg" style="background:#0f172a;border-radius:4px">';
  p.groups.forEach(function(x){s+='<rect x="'+(x.x*g)+'" y="'+(x.y*g)+'" width="'+(x.w*g)+'" height="'+(x.h*g)+'" fill="'+x.color+'" stroke="'+x.borderColor+'" stroke-width="1" rx="6" opacity="0.85"/>';s+='<text x="'+(x.x*g+6)+'" y="'+(x.y*g+12)+'" font-size="9" fill="'+x.borderColor+'">'+esc(x.label)+'</text>';});
  var bm={};p.blocks.forEach(function(b){bm[b.id]=b;});
  p.connections.forEach(function(c){var a=bm[c.from],b=bm[c.to];if(!a||!b)return;var x1=a.x*g+a.w*g/2,y1=a.y*g+a.h*g/2,x2=b.x*g+b.w*g/2,y2=b.y*g+b.h*g/2;s+='<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="#64748B" stroke-width="1"/>';});
  p.blocks.forEach(function(b){s+='<rect x="'+(b.x*g)+'" y="'+(b.y*g)+'" width="'+(b.w*g)+'" height="'+(b.h*g)+'" fill="'+b.color+'" rx="'+b.round+'" stroke="'+b.color+'" stroke-width="0.5"/>';b.label.split("\\\\n").forEach(function(ln,li,ar){var ty=b.y*g+b.h*g/2+(li-(ar.length-1)/2)*12;s+='<text x="'+(b.x*g+b.w*g/2)+'" y="'+ty+'" font-size="9" fill="'+b.textColor+'" text-anchor="middle" dominant-baseline="central">'+esc(ln)+'</text>';});});
  s+='</svg>';return s;
}
document.getElementById('old-svg').innerHTML=renderMiniSVG(parseDSL(${oldJson}));
document.getElementById('new-svg').innerHTML=renderMiniSVG(parseDSL(${newJson}));
</script></body></html>`;
}

// 本文の @include 先(include 先の中の @include も)を読む。キーは / 区切りの絶対パスで、webview の core/check expandIncludes が
// 本文のパス(docPath)からの相対パスで引く。読めないファイルは入れない(webview が「include 先を読めない」と示す)
function readIncludes(text, docPath) {
  const path = require('path');
  const fs = require('fs');
  const out = {};
  const walk = (src, file) => {
    for (const line of String(src).split('\n')) {
      const m = line.trim().match(/^@include\s+"([^"]+)"/);
      if (!m) continue;
      const abs = path.resolve(path.dirname(file), m[1]);
      const key = abs.split(path.sep).join('/');
      if (Object.prototype.hasOwnProperty.call(out, key)) continue;
      try { out[key] = fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, ''); } catch (e) { continue; }
      walk(out[key], abs);
    }
  };
  if (docPath) walk(text, docPath);
  return out;
}

function getWebviewContent(dslText, docPath) {
  // Use JSON.stringify to safely inject DSL text — avoids all escaping issues
  const dslJson = JSON.stringify(dslText);
  const includesJson = JSON.stringify(readIncludes(dslText, docPath)).replace(/</g, '\\u003c');
  const docPathJson = JSON.stringify(docPath ? String(docPath).split(require('path').sep).join('/') : '');

  // ───── Excel エクスポート用アセットをインライン埋め込み ─────
  // webview は file:// 制約と CSP のため <script type="module"> + import が
  // 使えないので、emitter.js / JSZip / template-skeleton を文字列として読み込み
  // <script> として inline する。emitter.js は ESM 形式なので `export` キーワードを
  // 剥がして window.StableBlockExcel に集約する。
  const path = require('path');
  const fs = require('fs');
  // REPO_ROOT 候補: (1) リポジトリ内レイアウト(vscode-stableblock/src → repo root)
  //                 (2) VSIX同梱レイアウト(拡張ルート直下に core/ をコピー。
  //                     vscode-stableblock/scripts/prepackage-core.js が package 前にコピーする)
  // core/label/label-core.mjs の存在有無で判定。どちらにも無ければ(1)にフォールバックし、
  // 以降の try/catch が従来通りログを出して機能を無効化する。
  const REPO_ROOT_CANDIDATES = [
    path.resolve(__dirname, '..', '..'),
    path.resolve(__dirname, '..'),
  ];
  const REPO_ROOT = REPO_ROOT_CANDIDATES.find((r) =>
    fs.existsSync(path.join(r, 'core', 'label', 'label-core.mjs'))
  ) || REPO_ROOT_CANDIDATES[0];
  let emitterScript = '';
  let jszipScript = '';
  const templateFiles = {};
  try {
    emitterScript = fs.readFileSync(path.join(REPO_ROOT, 'core', 'excel', 'emitter.js'), 'utf8');
    jszipScript = fs.readFileSync(path.join(REPO_ROOT, 'core', 'excel', 'jszip.min.js'), 'utf8');
    const TPL = [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/_rels/sheet1.xml.rels',
      'xl/drawings/_rels/drawing1.xml.rels',
    ];
    for (const f of TPL) {
      templateFiles[f] = fs.readFileSync(path.join(REPO_ROOT, 'core', 'excel', 'template-skeleton', ...f.split('/')), 'utf8');
    }
  } catch (e) {
    console.error('[stableblock] Failed to load Excel emitter assets:', e.message);
  }
  // ESM の `export function`/`export async function` を素の関数宣言に変換し、
  // 末尾で window.StableBlockExcel として一括公開する
  const emitterAsGlobals = emitterScript
    .replace(/^\s*export\s+(async\s+)?function\s+(\w+)/gm, '$1function $2')
    + '\n;window.StableBlockExcel = { pxToEmu, gridToEmu, escapeXml, normalizeColor, buildBlockShape, buildGroupShape, buildNoteShape, centerOfShape, computeConnectionEndpoints, buildConnectionShape, buildConnectionLabel, sortByZOrder, buildDrawingXml, packageXlsx, renderXlsx, connectionSiteIndex, listXlsxDrops };';
  const templateFilesJson = JSON.stringify(templateFiles);

  // ───── 接続ラベル共有ロジック(label-core.mjs)をインライン埋め込み ─────
  // emitter.js と同様、ESM の `export function` を剥がして window.StableBlockLabel に集約する。
  let labelCoreScript = '';
  try {
    labelCoreScript = fs.readFileSync(path.join(REPO_ROOT, 'core', 'label', 'label-core.mjs'), 'utf8');
  } catch (e) {
    console.error('[stableblock] Failed to load label-core:', e.message);
  }
  const labelCoreAsGlobals = labelCoreScript
    .replace(/^\s*export\s+(async\s+)?function\s+(\w+)/gm, '$1function $2')
    + '\n;window.StableBlockLabel = { extendPoint, bezierControls, bezierMidpoint, orthoPoints, polylineMidpoint, parseLpos, labelLayout, setConnLabelInDsl, isValidId, labelToId, uniqueId, idFieldOpen, isPlaceholderId, renameIdInDsl, fixPlaceholderIdsInDsl, unquoteLabel, quoteLabel, getSide, portPos, computePorts, chainConnectInDsl, pathPoints, connPathInfo, canvasRoute, connRoute, nextCanvasRoute, connectionPaths, hasLpos, estimateTextWidth, blockTextBoxes, labelObstacles, placeLabel, placeLabels, labelIssues, connLinesAmong, remapConnLine };';

  // ───── 図の検査(check-core.mjs)をインライン埋め込み。HTML 版・CLI と同じ診断 ─────
  let checkCoreScript = '';
  try {
    checkCoreScript = fs.readFileSync(path.join(REPO_ROOT, 'core', 'check', 'check-core.mjs'), 'utf8');
  } catch (e) {
    console.error('[stableblock] Failed to load check-core:', e.message);
  }
  const checkCoreAsGlobals = checkCoreScript
    .replace(/^\s*export\s+(async\s+)?function\s+(\w+)/gm, '$1function $2')
    + '\n;window.StableBlockCheck = { explainLine, findOverlaps, findOutside, segmentHitsRect, findCrossings, findStraddles, checkDiagram, resolveIncludePath, expandIncludes, checkIncluded, includeDrops, includeOrigin, includedItemNote };';

  // ───── キャンバス選択の共有ロジック(select-core.mjs)をインライン埋め込み ─────
  let selectCoreScript = '';
  try {
    selectCoreScript = fs.readFileSync(path.join(REPO_ROOT, 'core', 'select', 'select-core.mjs'), 'utf8');
  } catch (e) {
    console.error('[stableblock] Failed to load select-core:', e.message);
  }
  const selectCoreAsGlobals = selectCoreScript
    .replace(/^\s*export\s+(async\s+)?function\s+(\w+)/gm, '$1function $2')
    + '\n;window.StableBlockSelect = { pressSelect, releaseSelect, pruneSelection, sameSelection, stepDelta, arrowNudge };';

  // ───── キャンバスと配置の共有ロジック(layout-core.mjs)をインライン埋め込み ─────
  let layoutCoreScript = '';
  try {
    layoutCoreScript = fs.readFileSync(path.join(REPO_ROOT, 'core', 'layout', 'layout-core.mjs'), 'utf8');
  } catch (e) {
    console.error('[stableblock] Failed to load layout-core:', e.message);
  }
  const layoutCoreAsGlobals = layoutCoreScript
    .replace(/^\s*export\s+(async\s+)?function\s+(\w+)/gm, '$1function $2')
    + '\n;window.StableBlockLayout = { contentExtent, grownCanvasSize, setCanvasInDsl, setCanvasRouteInDsl, setCanvasGrowInDsl, canvasGrows, growCanvasInDsl, findFreeSlot, placeNext, fitZoom, stepZoom, paneWidths, parentMap, moveSides, edgeSides, growToContain, fitParents, groupRectFor, lastChildBlock, placeInGroup, placeInGroupFit };';

  // ───── Mermaid 書き出しの共有ロジック(mermaid-core.mjs)をインライン埋め込み ─────
  let mermaidCoreScript = '';
  try {
    mermaidCoreScript = fs.readFileSync(path.join(REPO_ROOT, 'core', 'mermaid', 'mermaid-core.mjs'), 'utf8');
  } catch (e) {
    console.error('[stableblock] Failed to load mermaid-core:', e.message);
  }
  const mermaidCoreAsGlobals = mermaidCoreScript
    .replace(/^\s*export\s+(async\s+)?function\s+(\w+)/gm, '$1function $2')
    + '\n;window.StableBlockMermaid = { mermaidLabel, mermaidIds, toMermaid };';

  // ───── 画面の語彙(terms-core.mjs)をインライン埋め込み ─────
  // 入口の名前・ツールチップ・選択肢の表示名。拡張は英語(en)を使う
  let termsCoreScript = '';
  try {
    termsCoreScript = fs.readFileSync(path.join(REPO_ROOT, 'core', 'terms', 'terms-core.mjs'), 'utf8');
  } catch (e) {
    console.error('[stableblock] Failed to load terms-core:', e.message);
  }
  const termsCoreAsGlobals = termsCoreScript
    .replace(/^\s*export\s+(async\s+)?function\s+(\w+)/gm, '$1function $2')
    + '\n;window.StableBlockTerms = { termText, termTitle, termKeys, styleName, lineShapeName, lineModeText, typeName };';

  // ───── 図の描画(render-core.mjs)をインライン埋め込み。画面と SVG / PNG の書き出しが HTML 版と同じ関数を使う ─────
  let renderCoreScript = '';
  try {
    renderCoreScript = fs.readFileSync(path.join(REPO_ROOT, 'core', 'render', 'render-core.mjs'), 'utf8');
  } catch (e) {
    console.error('[stableblock] Failed to load render-core:', e.message);
  }
  const renderCoreAsGlobals = renderCoreScript
    .replace(/^\s*export\s+(async\s+)?function\s+(\w+)/gm, '$1function $2')
    + '\n;window.StableBlockRender = { matchesSearchItem, searchMatches, nextMatch, isAnnotationConnOf, exportPngSize, renderSvg, exportSvg };';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--vscode-editor-background,#1e1e1e);color:var(--vscode-editor-foreground,#d4d4d4);font-family:var(--vscode-font-family,sans-serif);height:100vh;display:flex;flex-direction:column;overflow:hidden}
.toolbar{display:flex;gap:6px;align-items:center;padding:6px 8px;font-size:12px;flex-wrap:wrap;flex-shrink:0;border-bottom:1px solid var(--vscode-widget-border,#444)}
.tb{padding:3px 10px;font-size:11px;cursor:pointer;background:var(--vscode-button-secondaryBackground,#333);color:var(--vscode-button-secondaryForeground,#ccc);border:1px solid var(--vscode-widget-border,#444);border-radius:3px;font-family:inherit}
.tb:hover{background:var(--vscode-button-secondaryHoverBackground,#444)}
.tb-split-l{border-top-right-radius:0;border-bottom-right-radius:0}.tb-split-r{border-top-left-radius:0;border-bottom-left-radius:0;margin-left:-6px;border-left-width:0;padding:3px 6px}
#png-menu{position:fixed;z-index:60;padding:4px;background:var(--vscode-editorWidget-background,#252526);border:1px solid var(--vscode-widget-border,#444);border-radius:3px;box-shadow:0 4px 12px rgba(0,0,0,.35)}#png-menu[hidden]{display:none}#png-menu .tb{display:block;width:100%;margin-top:4px;text-align:left;white-space:nowrap}
.sep{width:1px;height:14px;background:var(--vscode-widget-border,#444)}
.main{flex:1;display:flex;overflow:hidden}
#preview{flex:1;overflow:auto;padding:8px}
.inline-label{position:fixed;z-index:40;box-sizing:border-box;margin:0;padding:2px 6px;border:2px solid #6366F1;border-radius:4px;background:#fff;color:#0F172A;font:600 12px sans-serif;text-align:center;outline:none;box-shadow:0 4px 12px rgba(0,0,0,.35);resize:none}
textarea.inline-label{text-align:left;font-weight:400;line-height:1.4}
#wrap{background:#fff;border-radius:6px;display:inline-block;line-height:0}
#wrap svg{overflow:visible}
#propPanel{width:200px;min-width:160px;border-left:1px solid var(--vscode-widget-border,#444);overflow-y:auto;padding:8px;font-size:11px;flex-shrink:0}
.pane-split{flex:0 0 6px;margin:0 -6px 0 0;position:relative;z-index:5;cursor:col-resize;touch-action:none;outline:none}
.pane-split::after{content:'';position:absolute;top:0;bottom:0;left:0;width:3px;background:transparent}
.pane-split:hover::after,.pane-split.dragging::after,.pane-split:focus-visible::after{background:var(--vscode-focusBorder,#6366F1)}
body.pane-resizing,body.pane-resizing *{cursor:col-resize!important;user-select:none!important}
.error{background:var(--vscode-inputValidation-errorBackground,#5a1d1d);color:#f88;padding:4px 8px;border-radius:4px;margin-bottom:6px;font-size:11px}
.error.warn-only{background:#422006;color:#FDE68A}.error .dg-warn{color:#FDE68A}
.stats{padding:3px 8px;font-size:10px;color:var(--vscode-descriptionForeground,#888);border-top:1px solid var(--vscode-widget-border,#444);flex-shrink:0}
.pl{font-size:9px;color:var(--vscode-descriptionForeground,#888);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px;margin-top:8px}
.pi{background:var(--vscode-input-background,#333);border:1px solid var(--vscode-widget-border,#444);border-radius:3px;color:var(--vscode-input-foreground,#ccc);padding:3px 6px;font-size:11px;width:100%;outline:none;font-family:inherit}
.pi:focus{border-color:var(--vscode-focusBorder,#007fd4)}
.pr{display:flex;gap:4px;margin-bottom:4px}
.stepper{display:flex;align-items:stretch}
.stepper input{flex:1;min-width:0;text-align:center;border-radius:3px 0 0 3px;border-right:none}
.stcol{display:flex;flex-direction:column;width:18px;flex-shrink:0}
.stb{flex:1;border:1px solid var(--vscode-widget-border,#444);background:var(--vscode-button-secondaryBackground,#333);color:#999;cursor:pointer;font-size:8px;display:flex;align-items:center;justify-content:center;padding:0}
.stb:hover{background:var(--vscode-button-secondaryHoverBackground,#444);color:#fff}
.stb.up{border-radius:0 3px 0 0;border-bottom:none}
.stb.dn{border-radius:0 0 3px 0}
.cg{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px}
.cd{width:16px;height:16px;border-radius:3px;cursor:pointer;border:2px solid transparent}
.cd.act{border-color:#fff;box-shadow:0 0 0 1px #6366F1}
.pbtn{padding:4px 8px;font-size:10px;font-weight:600;border:1px solid var(--vscode-widget-border,#444);border-radius:3px;cursor:pointer;background:var(--vscode-button-secondaryBackground,#333);color:#ccc;width:100%;font-family:inherit;margin-bottom:4px}
.pbtn:hover{background:var(--vscode-button-secondaryHoverBackground,#444)}
.sbtn{padding:2px 8px;font-size:10px;border:1px solid var(--vscode-widget-border,#444);border-radius:3px;cursor:pointer;background:var(--vscode-button-secondaryBackground,#333);color:#999;font-family:inherit}
.sbtn.act{background:#6366F1;color:#fff;border-color:#6366F1}
.hl-act{border-color:#F59E0B!important;color:#FDE68A!important;background:#422006!important}
.anno-act{border-color:#F59E0B!important;color:#FDE68A!important;background:#422006!important}
</style>
<script>${jszipScript}<\/script>
<script>${emitterAsGlobals}<\/script>
<script>${labelCoreAsGlobals}<\/script>
<script>${checkCoreAsGlobals}<\/script>
<script>${selectCoreAsGlobals}<\/script>
<script>${layoutCoreAsGlobals}<\/script>
<script>${mermaidCoreAsGlobals}<\/script>
<script>${termsCoreAsGlobals}<\/script>
<script>${renderCoreAsGlobals}<\/script>
<script>window.StableBlockTemplateFiles = ${templateFilesJson};<\/script>
</head><body>
<div class="toolbar">
  <button class="tb" data-term="zoom-out" onclick="sz(-1)" title="Zoom out">&minus;</button><span id="zl" style="min-width:36px;text-align:center">100%</span><button class="tb" data-term="zoom-in" onclick="sz(1)" title="Zoom in">+</button><button class="tb" data-term="fit" onclick="fitV()" title="Fit the whole diagram (F key)">Fit</button>
  <div class="sep"></div><button class="tb" data-term="undo" onclick="undo()" title="Undo (Ctrl+Z)">&#x21A9;</button><button class="tb" data-term="redo" onclick="redo()" title="Redo (Ctrl+Y)">&#x21AA;</button>
  <div class="sep"></div><button class="tb" data-term="highlight" id="hl-btn" onclick="toggleHL()" title="Dim blocks without connections / restore (H key)">&#x25CE; Dim unlinked</button>
  <div class="sep"></div><button class="tb anno-act" data-term="anno" id="anno-btn" onclick="toggleAnno()" title="Show / hide notes (N key). Click a shown note to select it">&#x25C7; Show notes</button><button class="tb" data-term="fix-id" id="fix-id-btn" onclick="fixIds()" title="Give elements still on a placeholder ID (__new_) an ID from their label, as written (connections follow). Labels without letters or digits need the ID field">Fix IDs</button>
  <div class="sep"></div><button class="tb" data-term="export-svg" onclick="exportSVG()" title="Save as SVG">SVG</button><button class="tb tb-split-l" data-term="export-png" onclick="exportPNG()" title="Save as PNG">PNG</button><button class="tb tb-split-r" data-term="png-more" id="png-more" aria-haspopup="menu" aria-label="More PNG options" onclick="openPngMenu(this)" title="More PNG options (transparent background, copy to the clipboard)">&#x25BE;</button><div id="png-menu" role="menu" hidden><button class="tb" role="menuitem" data-term="export-png-transparent" onclick="pngMenuDo(exportPNGT)" title="Save as PNG with a transparent background">Save with transparent background</button><button class="tb" role="menuitem" data-term="copy-png" onclick="pngMenuDo(copyPNG)" title="Copy the diagram to the clipboard as PNG">Copy to clipboard</button></div><button class="tb" data-term="export-xlsx" onclick="exportXlsx()" title="Save as Excel (.xlsx)">Excel</button>
  <div class="sep"></div><button class="tb" data-term="export-mermaid" onclick="exportMmd()" title="Save as Mermaid (.mmd)">Mermaid</button>
  <div class="sep"></div><input class="pi" data-term="search" id="search-input" placeholder="Search ID / label" title="Filter by ID / label and dim the rest. Enter selects the matches one by one in reading order (Shift+Enter: back)" style="width:110px;font-size:10px" oninput="doSearch(this.value)" onkeydown="if(event.key===&quot;Enter&quot;&amp;&amp;!event.isComposing){event.preventDefault();searchStep(event.shiftKey?-1:1);}"><span id="search-count" style="font-size:10px;color:#888;white-space:nowrap"></span>
  <div class="sep"></div><span id="si" style="font-size:10px;color:var(--vscode-descriptionForeground,#888)"></span>
</div>
<div id="err"></div>
<div class="main"><div id="preview"><div id="wrap"></div></div><div class="pane-split" id="split-right" data-side="right" role="separator" aria-orientation="vertical" aria-controls="propPanel" tabindex="0" title="Drag to resize the preview and the side panel (double-click to reset; arrow keys also move it)"></div><div id="propPanel"></div></div>
<div class="stats"><span id="stats"></span> <button class="sbtn" id="cvstat" onclick="cvShow()" title="Canvas size and whether it grows when items overflow. Click to show the setting in the side panel"></button> <span id="cvgrew" style="color:#FDE68A"></span></div>

<script>
var vscodeApi = acquireVsCodeApi();
var dsl = ${dslJson};
// @include 先(拡張ホストが本文のファイルからの相対パスで読んだもの)。EXP は parsed と同じ本文を展開した結果(core/check expandIncludes)
var INCLUDES = ${includesJson}, DOC_PATH = ${docPathJson}, EXP = null;
function parseDoc(){EXP=window.StableBlockCheck.expandIncludes(dsl,function(p){return Object.prototype.hasOwnProperty.call(INCLUDES,p)?INCLUDES[p]:null;},DOC_PATH);return parseDSL(EXP.text);}
function incDrops(){return window.StableBlockCheck.includeDrops(EXP);}
// lastAddedId / lastPaste: the next "+ Block" / paste lines up to their right (core/layout placeNext)
var lastAddedId=null,lastPaste=null;
var zm=1,parsed=null,sel=[],hist=[],fut=[],addC=1,highlight=false,showAnno=true,searchQ="",snapGuides=[];
// Property panel ID field: once the user opens it, it stays open across selections (core/label idFieldOpen)
var idOpen=false;
// selClk: sel がクリック(Shift+クリック)の順に並んでいるか(Ctrl+A・貼付は順が決まらない)
var selClk=false;
var COLORS=["#6366F1","#8B5CF6","#EC4899","#EF4444","#F59E0B","#D97706","#22C55E","#16A34A","#06B6D4","#3B82F6","#64748B","#DC2626"];
var BG_COLORS=["#EEF2FF","#F5F3FF","#FCE7F3","#FEE2E2","#FEF3C7","#FFF7ED","#DCFCE7","#D1FAE5","#CFFAFE","#DBEAFE","#F1F5F9","#F8FAFC"];
var NOTE_COLORS=["#FEF3C7","#FEE2E2","#DBEAFE","#DCFCE7","#F5F3FF","#FCE7F3","#CFFAFE","#FFF7ED","#F1F5F9","#FEF9C3","#ECFDF5","#F8FAFC"];

function pushH(){hist.push(dsl);if(hist.length>80)hist.shift();fut.length=0;}
function undo(){if(!hist.length)return;fut.push(dsl);dsl=hist.pop();sel=[];grewFrom=null;go();notify(true);}
function redo(){if(!fut.length)return;hist.push(dsl);dsl=fut.pop();sel=[];grewFrom=null;go();notify(true);}
// GUI の操作で要素がキャンバスからはみ出したら @canvas 行を広げてから本文に返す(undo/redo は noGrow)。@canvas に grow=off があれば広げない(core/layout)
// grewFrom: 自動で広げる前の寸法。下端の「Restore size and fix」の戻し先(HTML 版の「元の寸法に戻して固定」と同じ)
var grewFrom=null;
function growCv(){var p=parseDoc(),nd=window.StableBlockLayout.growCanvasInDsl(dsl,p.canvas,p.blocks.concat(p.groups,p.notes));if(nd===dsl)return false;if(!grewFrom)grewFrom={width:p.canvas.width,height:p.canvas.height};dsl=nd;return true;}
function notify(noGrow){if(!noGrow&&growCv())go();showGrew();vscodeApi.postMessage({type:"dslUpdate",dsl:dsl});}
function showGrew(){var el=document.getElementById('cvgrew'),c=parsed&&parsed.canvas;if(!el)return;if(!grewFrom||!c||(grewFrom.width===c.width&&grewFrom.height===c.height)){el.innerHTML='';return;}
  el.innerHTML='Canvas grown '+grewFrom.width+'x'+grewFrom.height+' &rarr; '+c.width+'x'+c.height+' <button class="sbtn" id="cv-fix" onclick="cvFix()" title="Restore the size before it grew and stop growing it (grow=off on the @canvas line)">Restore size and fix</button>';}
// 自動で広げる前の寸法に戻し、grow=off を書く(本文の差分は @canvas の 1 行)
function cvFix(){if(!grewFrom)return;var L=window.StableBlockLayout,f=grewFrom;pushH();grewFrom=null;dsl=L.setCanvasGrowInDsl(L.setCanvasInDsl(dsl,f.width,f.height),false);go();notify();}
// 「はみ出したら自動で広げる」の切替。外すと @canvas 行に grow=off を書く
function cvGrow(on){var nd=window.StableBlockLayout.setCanvasGrowInDsl(dsl,on);if(nd===dsl)return;pushH();grewFrom=null;dsl=nd;go();notify();}
// 下端の「Canvas WxH grows / fixed」: 押すと選択を外し、右の CANVAS(Grow when items overflow)を光らせて示す(HTML 版のステータスバーの Canvas と同じ)
function cvStat(){var el=document.getElementById('cvstat'),c=parsed&&parsed.canvas;if(!el||!c)return;el.textContent='Canvas '+c.width+'x'+c.height+(window.StableBlockLayout.canvasGrows(c)?' grows':' fixed');}
function cvShow(){if(!parsed)return;if(sel.length){sel=[];render();}props();var s=document.getElementById('cv-sec');if(!s)return;s.scrollIntoView({block:'nearest'});s.style.outline='2px solid #F59E0B';setTimeout(function(){s.style.outline='';},1600);var g=document.getElementById('cv-grow');if(g)g.focus();}
function isSel(id){return sel.some(function(s){return s.id===id});}
function getIt(s){return parsed.blockMap[s.id]||parsed.groupMap[s.id]||parsed.nm[s.id];}
function isAnnoConn(c){return !!(parsed.nm[c.from]||parsed.nm[c.to]);}
function allMap(){var r={},k;for(k in parsed.blockMap)r[k]=parsed.blockMap[k];for(k in parsed.nm)r[k]=parsed.nm[k];return r;}
function esc(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

function parseDSL(t){
  var ls=t.split("\\n"),cv={width:960,height:640,grid:20},bl=[],gr=[],nt=[],cn=[],er=[],bm={},gm={},nm={},aids={};
  for(var i=0;i<ls.length;i++){
    var r=ls[i].trim();if(!r||r.startsWith("#"))continue;var ln=i+1;
    try{
      if(r.startsWith("@canvas")){var w=r.match(/width=(\\d+)/),h=r.match(/height=(\\d+)/),g=r.match(/grid=(\\d+)/),rt=r.match(/route=(\\S+)/),gw=r.match(/grow=(\\S+)/);if(w)cv.width=+w[1];if(h)cv.height=+h[1];if(g)cv.grid=+g[1];if(rt)cv.route=rt[1];if(gw)cv.grow=gw[1];continue;}
      var m=r.match(/^block\\s+(\\S+)\\s+"((?:\\\\"|[^"])*)"\\s+at\\s+([\\d.]+),([\\d.]+)\\s+size\\s+([\\d.]+)x([\\d.]+)(.*)/);
      if(m){if(aids[m[1]])er.push({line:ln,msg:'Duplicate ID "'+m[1]+'" (L'+aids[m[1]]+')'});aids[m[1]]=ln;var b={type:"block",id:m[1],label:window.StableBlockLabel.unquoteLabel(m[2]),x:+m[3],y:+m[4],w:+m[5],h:+m[6],color:(m[7].match(/color=(\\S+)/)||[])[1]||"#3B82F6",textColor:(m[7].match(/text=(\\S+)/)||[])[1]||"#FFFFFF",borderColor:(m[7].match(/border=(\\S+)/)||[])[1]||null,round:+((m[7].match(/round=(\\d+)/)||[])[1]||"4"),style:(m[7].match(/style=(\\S+)/)||[])[1]||"solid",line:ln};bl.push(b);bm[b.id]=b;continue;}
      m=r.match(/^group\\s+(\\S+)\\s+"((?:\\\\"|[^"])*)"\\s+at\\s+([\\d.]+),([\\d.]+)\\s+size\\s+([\\d.]+)x([\\d.]+)(.*)/);
      if(m){if(aids[m[1]])er.push({line:ln,msg:'Duplicate ID "'+m[1]+'" (L'+aids[m[1]]+')'});aids[m[1]]=ln;var g2={type:"group",id:m[1],label:window.StableBlockLabel.unquoteLabel(m[2]),x:+m[3],y:+m[4],w:+m[5],h:+m[6],color:(m[7].match(/color=(\\S+)/)||[])[1]||"#F3F4F6",borderColor:(m[7].match(/border=(\\S+)/)||[])[1]||"#9CA3AF",line:ln};gr.push(g2);gm[g2.id]=g2;continue;}
      m=r.match(/^note\\s+(\\S+)\\s+"((?:\\\\"|[^"])*)"\\s+at\\s+([\\d.]+),([\\d.]+)\\s+size\\s+([\\d.]+)x([\\d.]+)(.*)/);
      if(m){if(aids[m[1]])er.push({line:ln,msg:'Duplicate ID "'+m[1]+'" (L'+aids[m[1]]+')'});aids[m[1]]=ln;var n={type:"note",id:m[1],label:window.StableBlockLabel.unquoteLabel(m[2]),x:+m[3],y:+m[4],w:+m[5],h:+m[6],color:(m[7].match(/color=(\\S+)/)||[])[1]||"#FEF3C7",textColor:(m[7].match(/text=(\\S+)/)||[])[1]||"#92400E",borderColor:(m[7].match(/border=(\\S+)/)||[])[1]||null,round:+((m[7].match(/round=(\\d+)/)||[])[1]||"4"),style:(m[7].match(/style=(\\S+)/)||[])[1]||null,line:ln};nt.push(n);nm[n.id]=n;continue;}
      m=r.match(/^(\\S+)\\s+(-->|->)\\s+(\\S+)\\s*(?:"((?:\\\\"|[^"])*)")?\\s*(.*)/);
      if(m){cn.push({from:m[1],to:m[3],label:window.StableBlockLabel.unquoteLabel(m[4]||""),color:(m[5].match(/color=(\\S+)/)||[])[1]||"#64748B",style:(m[5].match(/style=(\\S+)/)||[])[1]||"solid",width:+(m[5].match(/width=([\\d.]+)/)||[])[1]||1.5,route:(m[5].match(/route=(\\S+)/)||[])[1]||null,lpos:window.StableBlockLabel.parseLpos(m[5]),lposAuto:!window.StableBlockLabel.hasLpos(m[5]),bidir:m[2]==="-->",line:ln});continue;}
      if(r.startsWith("@include")){er.push({line:ln,msg:"@include requires preprocessing (extension host)"});continue;}
      er.push({line:ln,msg:r.substring(0,40)});
    }catch(e){er.push({line:ln,msg:e.message});}
  }
  return{canvas:cv,blocks:bl,groups:gr,notes:nt,connections:cn,errors:er,blockMap:bm,groupMap:gm,nm:nm,noteMap:nm};
}

function upP(tp,id,nx,ny){var re=new RegExp("^(\\\\s*"+tp+"\\\\s+)("+id+")(\\\\s+\\"(?:\\\\\\\\\\"|[^\\"])*\\"\\\\s+at\\\\s+)[\\\\d.]+,[\\\\d.]+(\\\\s+size\\\\s+.*)$","m");dsl=dsl.replace(re,"$1$2$3"+nx+","+ny+"$4");}
function upS(tp,id,nw,nh){var re=new RegExp("^(\\\\s*"+tp+"\\\\s+"+id+"\\\\s+\\"(?:\\\\\\\\\\"|[^\\"])*?\\"\\\\s+at\\\\s+[\\\\d.]+,[\\\\d.]+\\\\s+size\\\\s+)[\\\\d.]+x[\\\\d.]+","m");dsl=dsl.replace(re,"$1"+nw+"x"+nh);}
function upPr(tp,id,prop,val){var lines=dsl.split("\\n"),lr=new RegExp("^\\\\s*"+tp+"\\\\s+"+id+"\\\\s+"),pr=new RegExp(prop+"=\\\\S+");for(var i=0;i<lines.length;i++){if(!lr.test(lines[i]))continue;lines[i]=pr.test(lines[i])?lines[i].replace(pr,prop+"="+val):lines[i].trimEnd()+" "+prop+"="+val;break;}dsl=lines.join("\\n");}
function upLb(tp,id,lb){var re=new RegExp("^(\\\\s*"+tp+"\\\\s+"+id+"\\\\s+)\\"(?:\\\\\\\\\\"|[^\\"])*\\"(\\\\s+at\\\\s+.*)$","m");dsl=dsl.replace(re,function(_,a,b){return a+window.StableBlockLabel.quoteLabel(lb)+b;});}
function isIn(c,p){return c.x>=p.x&&c.y>=p.y&&c.x+c.w<=p.x+p.w&&c.y+c.h<=p.y+p.h;}
function fCh(gr){return{cb:parsed.blocks.filter(function(b){return isIn(b,gr)}),cg:parsed.groups.filter(function(x){return x.id!==gr.id&&isIn(x,gr)})};}
// Nested groups (core/layout): note the parents before an edit (parNow); when a child crosses its parent's frame, grow the parent (and its parents) that way (growPar)
function boxIt(){return parsed.blocks.concat(parsed.groups);}
function parNow(){return window.StableBlockLayout.parentMap(boxIt());}
function growPar(before,moved,seeds){parsed=parseDoc();var ch=window.StableBlockLayout.fitParents(boxIt(),before,moved,1,seeds);ch.forEach(function(r){upP(r.type,r.id,r.x,r.y);if(r.type==='group')upS('group',r.id,r.w,r.h);});if(ch.length)parsed=parseDoc();}
function axSides(ax,d){return window.StableBlockLayout.moveSides(ax==='x'?d:0,ax==='y'?d:0);}

function eP(p,side,d){if(side==='top')return{x:p.x,y:p.y-d};if(side==='bottom')return{x:p.x,y:p.y+d};if(side==='left')return{x:p.x-d,y:p.y};return{x:p.x+d,y:p.y};}
var _mCtx=document.createElement('canvas').getContext('2d');
var SVG_FONT='sans-serif';
function measureLabel(t){_mCtx.font='500 10px sans-serif';return _mCtx.measureText(t).width;}

function toggleHL(){highlight=!highlight;var btn=document.getElementById('hl-btn');if(btn)btn.classList.toggle('hl-act',highlight);render();}

function toggleAnno(){
  showAnno=!showAnno;
  var btn=document.getElementById('anno-btn');
  if(btn)btn.classList.toggle('anno-act',showAnno);
  if(!showAnno)sel=sel.filter(function(s){return s.type!=='note'});
  render();props();
}

function render(){
  if(!parsed)return;
  // 画面と書き出しは HTML 版と同じ core/render の renderSvg で描く(画面だけの状態は view で渡す)
  document.getElementById('wrap').innerHTML=window.StableBlockRender.renderSvg(parsed,{zoom:zm,sel:sel,highlight:highlight,search:searchQ,showAnnotations:showAnno,snapGuides:snapGuides,grid:true,font:SVG_FONT},window.StableBlockLabel,measureLabel);searchCount();
  setupInt();
}

// Interactions
function svgSc(){var svg=document.querySelector('#wrap svg');if(!svg)return{sx:1,sy:1};var r=svg.getBoundingClientRect();return{sx:parsed.canvas.width/r.width,sy:parsed.canvas.height/r.height};}

function setupInt(){
  var g=parsed.canvas.grid;
  // Resize
  document.querySelectorAll('[data-resize]').forEach(function(el){el.addEventListener('mousedown',function(e){
    e.preventDefault();e.stopPropagation();relFocus();var edge=el.dataset.resize,id=el.dataset.rid,tp=el.dataset.rtype;
    var it=tp==="block"?parsed.blockMap[id]:tp==="note"?parsed.nm[id]:parsed.groupMap[id];if(!it)return;pushH();
    var sc=svgSc(),mx0=e.clientX,my0=e.clientY,ox=it.x,oy=it.y,ow=it.w,oh=it.h,before=parNow();
    function onM(ev){var dx=Math.round((ev.clientX-mx0)*sc.sx/g),dy=Math.round((ev.clientY-my0)*sc.sy/g),nx=ox,ny=oy,nw=ow,nh=oh;
      if(edge.indexOf('e')>=0)nw=Math.max(1,ow+dx);if(edge.indexOf('w')>=0){nw=Math.max(1,ow-dx);nx=ox+ow-nw;}
      if(edge.indexOf('s')>=0)nh=Math.max(1,oh+dy);if(edge.indexOf('n')>=0){nh=Math.max(1,oh-dy);ny=oy+oh-nh;}
      upP(tp,id,Math.max(0,nx),Math.max(0,ny));upS(tp,id,nw,nh);parsed=parseDoc();render();}
    function onU(){window.removeEventListener('mousemove',onM);window.removeEventListener('mouseup',onU);growPar(before,[{id:id,sides:window.StableBlockLayout.edgeSides(edge)}]);go();notify();}
    window.addEventListener('mousemove',onM);window.addEventListener('mouseup',onU);});});

  // Drag
  document.querySelectorAll('#wrap g[data-id]').forEach(function(el){el.addEventListener('mousedown',function(e){
    e.preventDefault();e.stopPropagation();relFocus();var tp=el.dataset.type,id=el.dataset.id;
    var shift=e.shiftKey,hit={type:tp,id:id};sel=window.StableBlockSelect.pressSelect(sel,hit,shift);selClk=true;
    render();props();
    var sc=svgSc(),mx0=e.clientX,my0=e.clientY,ds=new Map();
    sel.forEach(function(si){var it=getIt(si);if(!it)return;ds.set(si.id,{type:si.type,id:si.id,sx:it.x,sy:it.y});
      if(si.type==="group"){var ch=fCh(it);ch.cb.forEach(function(b){if(!ds.has(b.id))ds.set(b.id,{type:"block",id:b.id,sx:b.x,sy:b.y});});ch.cg.forEach(function(x){if(!ds.has(x.id))ds.set(x.id,{type:"group",id:x.id,sx:x.x,sy:x.y});});}});
    var items=Array.from(ds.values()),moved=false,hp=false,dragIds=new Set(),before=parNow(),lastD={x:0,y:0};items.forEach(function(it){dragIds.add(it.id);});
    function onM(ev){var dx=Math.round((ev.clientX-mx0)*sc.sx/g),dy=Math.round((ev.clientY-my0)*sc.sy/g);if(!moved&&!dx&&!dy)return;if(!hp){pushH();hp=true;}moved=true;lastD={x:dx,y:dy};items.forEach(function(it){upP(it.type,it.id,Math.max(0,it.sx+dx),Math.max(0,it.sy+dy));});parsed=parseDoc();
      // Snap guides
      snapGuides=[];var thresh=0.5;var selItems=sel.map(function(si){return getIt(si)}).filter(Boolean);var others=parsed.blocks.concat(parsed.groups).concat(parsed.notes).filter(function(o){return !dragIds.has(o.id)});selItems.forEach(function(si){var sx=si.x,sy=si.y,smx=si.x+si.w/2,smy=si.y+si.h/2,sex=si.x+si.w,sey=si.y+si.h;others.forEach(function(o){var ox=o.x,oy=o.y,omx=o.x+o.w/2,omy=o.y+o.h/2,oex=o.x+o.w,oey=o.y+o.h;if(Math.abs(sx-ox)<=thresh)snapGuides.push({x1:sx*g,y1:0,x2:sx*g,y2:parsed.canvas.height});if(Math.abs(sex-oex)<=thresh)snapGuides.push({x1:sex*g,y1:0,x2:sex*g,y2:parsed.canvas.height});if(Math.abs(smx-omx)<=thresh)snapGuides.push({x1:smx*g,y1:0,x2:smx*g,y2:parsed.canvas.height});if(Math.abs(sx-oex)<=thresh)snapGuides.push({x1:sx*g,y1:0,x2:sx*g,y2:parsed.canvas.height});if(Math.abs(sex-ox)<=thresh)snapGuides.push({x1:sex*g,y1:0,x2:sex*g,y2:parsed.canvas.height});if(Math.abs(sy-oy)<=thresh)snapGuides.push({x1:0,y1:sy*g,x2:parsed.canvas.width,y2:sy*g});if(Math.abs(sey-oey)<=thresh)snapGuides.push({x1:0,y1:sey*g,x2:parsed.canvas.width,y2:sey*g});if(Math.abs(smy-omy)<=thresh)snapGuides.push({x1:0,y1:smy*g,x2:parsed.canvas.width,y2:smy*g});if(Math.abs(sy-oey)<=thresh)snapGuides.push({x1:0,y1:sy*g,x2:parsed.canvas.width,y2:sy*g});if(Math.abs(sey-oy)<=thresh)snapGuides.push({x1:0,y1:sey*g,x2:parsed.canvas.width,y2:sey*g});});});
      render();}
    function onU(){window.removeEventListener('mousemove',onM);window.removeEventListener('mouseup',onU);snapGuides=[];if(moved){var sds=window.StableBlockLayout.moveSides(lastD.x,lastD.y);growPar(before,items.map(function(it){return{id:it.id,sides:sds}}));go();notify();return;}
      var now=Date.now();if(!shift&&lastClick&&lastClick.id===id&&now-lastClick.t<450){lastClick=null;startInl(tp,id);return;}lastClick=shift?null:{id:id,t:now};
      var nx=window.StableBlockSelect.releaseSelect(sel,hit,shift,false);if(!window.StableBlockSelect.sameSelection(nx,sel)){sel=nx;render();props();}}
    window.addEventListener('mousemove',onM);window.addEventListener('mouseup',onU);});});

  // Deselect
  var svg=document.querySelector('#wrap svg');
  if(svg)svg.addEventListener('mousedown',function(e){if(e.target.tagName==='svg'||(e.target.tagName==='rect'&&!e.target.closest('g[data-id]')&&!e.target.dataset.resize)){relFocus();clrSel();}});
}
// Deselect all (Esc, blank canvas, margin of the preview)
function clrSel(){if(!sel.length)return;sel=[];render();props();}
// Pressing the canvas moves focus to it: a toolbar button that keeps focus would be pressed again by Enter (item mousedown is preventDefault'ed)
// lastClick: the item last clicked without moving; pressing anywhere else or typing forgets it (two far-apart clicks are not a double-click)
var lastClick=null,inl=null;
document.addEventListener('mousedown',function(e){var g=e.target.closest&&e.target.closest('#wrap g[data-id]');if(!g||!lastClick||g.dataset.id!==lastClick.id)lastClick=null;},true);
document.addEventListener('keydown',function(){lastClick=null;},true);
function relFocus(){if(inl)finInl(true);var a=document.activeElement;if(a&&a!==document.body&&typeof a.blur==='function')a.blur();}
// Edit a label on the canvas (double-click / F2 / Enter): an input over the item rewrites only its label line as you type.
// Enter or a press elsewhere commits, Esc restores the text as it was. Notes are multi-line (Shift+Enter).
function startInl(tp,id){if(inl)finInl(true);var it=tp==='block'?parsed.blockMap[id]:tp==='group'?parsed.groupMap[id]:parsed.nm[id];if(!it)return;
  sel=[{type:tp,id:id}];render();props();
  var gs=document.querySelectorAll('#wrap g[data-id]'),g=null;for(var k=0;k<gs.length;k++){if(gs[k].dataset.id===id&&gs[k].dataset.type===tp){g=gs[k];break;}}if(!g)return;
  var r=g.querySelector('rect').getBoundingClientRect(),isN=tp==='note',isG=tp==='group';
  var el=document.createElement(isN?'textarea':'input');el.className='inline-label';el.id='inline-label';el.spellcheck=false;
  el.value=isN?it.label.split("\\\\n").join("\\n"):it.label;
  var h=isG?Math.max(22,Math.min(r.height,28)):isN?Math.max(r.height,44):Math.max(r.height,24);
  el.style.left=r.left+'px';el.style.top=r.top+'px';el.style.width=Math.max(r.width,isG?140:80)+'px';el.style.height=h+'px';if(isG)el.style.textAlign='left';
  document.body.appendChild(el);
  var ed={el:el,type:tp,id:id,origId:id,snap:dsl,pushed:false,auto:new Set(autoIds)};inl=ed;
  el.addEventListener('input',function(){if(inl!==ed)return;if(!ed.pushed){pushH();ed.pushed=true;}var v=isN?el.value.replace(/\\n/g,"\\\\n"):el.value;sel=[{type:ed.type,id:ed.id}];
    upLb(ed.type,ed.id,v);fLbId(isN?el.value:v);ed.id=sel[0].id;parsed=parseDSL(dsl);render();showErr();});
  el.addEventListener('keydown',function(e){if(e.key==='Enter'&&!(isN&&e.shiftKey)){e.preventDefault();e.stopPropagation();finInl(true);askId();}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finInl(false);}else if(e.key==='Tab'){e.preventDefault();e.stopPropagation();var nx=nextRead(ed.type,ed.id,e.shiftKey?-1:1);finInl(true);if(nx)startInl(nx.type,nx.id);}});
  el.addEventListener('blur',function(){if(inl===ed)finInl(true);});
  el.focus();el.select();}
// Tab / Shift+Tab: commit and edit the next / previous item of the same kind in reading order (rows top to bottom, left to right)
function nextRead(tp,id,dir){var list=(tp==='block'?parsed.blocks:tp==='group'?parsed.groups:parsed.notes).slice().sort(function(a,b){return a.y-b.y||a.x-b.x||a.line-b.line});var i=-1;for(var k=0;k<list.length;k++){if(list[k].id===id){i=k;break;}}return i<0?null:(list[i+dir]||null);}
function finInl(commit){var ed=inl;if(!ed)return;inl=null;
  if(!commit&&ed.pushed){dsl=ed.snap;hist.pop();sel=[{type:ed.type,id:ed.origId}];autoIds.clear();ed.auto.forEach(function(x){autoIds.add(x);});}
  ed.el.remove();go();if(ed.pushed)notify(true);}

// Property Panel
// Every selection change goes through props: drop items the DSL no longer has, then keep Sel: N in step
function props(){if(parsed)sel=window.StableBlockSelect.pruneSelection(sel,parsed);propsPanel();if(parsed)selStat();}
function selStat(){cvStat();document.getElementById('stats').textContent='Blocks:'+parsed.blocks.length+' Groups:'+parsed.groups.length+' Notes:'+parsed.notes.length+' Conn:'+parsed.connections.length+' Sel:'+sel.length;
  document.getElementById('si').textContent=sel.length?sel.length+' selected':'Click to select';}
function propsPanel(){
  var el=document.getElementById('propPanel');
  if(!sel.length){
    {
      el.innerHTML='<div class="pl" style="margin-top:0">TOOLS</div>'+
        '<button class="pbtn" data-term="add-block" onclick="addBlock()" title="Add a block right of the last one added (same size and color)">+ Block</button>'+
        '<button class="pbtn" data-term="add-group" onclick="addGroup()" title="Add a group at a free spot">+ Group</button>'+
        '<button class="pbtn" data-term="add-note" style="border-color:#F59E0B;color:#FDE68A" onclick="addNote()" title="Add a note at a free spot">+ Note</button>'+
        '<div class="pl">CANVAS</div><label id="cv-sec" style="display:flex;gap:4px;align-items:center;font-size:10px;cursor:pointer" title="Off writes grow=off on the @canvas line: the size you set for a document page stays fixed and overflowing items are reported"><input type="checkbox" id="cv-grow"'+(parsed&&window.StableBlockLayout.canvasGrows(parsed.canvas)?' checked':'')+' onchange="cvGrow(this.checked)"> Grow when items overflow</label>'+
        '<div class="pl">CONNECT</div>'+
        '<div id="connGuide" style="font-size:9px;color:#888;line-height:1.4">Shift+Click blocks in order, then press "a &rarr; b" (3+: "a &rarr; b &rarr; c"). Flip the direction afterwards"</div>'+
        '<div style="margin-top:12px;font-size:9px;color:#888;line-height:1.4">Click: select<br>Shift+Click: multi<br>Drag: move<br>Handles: resize<br>Double-click / F2: edit label (Tab: next)<br>Ctrl+Z/Y: undo/redo<br>Del: delete<br>H: dim unlinked N: show notes</div>';
    }
    return;
  }
  if(sel.length>1){
    var mh='<div class="pl" style="margin-top:0">'+sel.length+' SELECTED</div>'+
      stepper2("Position","stepF('x','dn')","stepF('x','up')","stepF('y','dn')","stepF('y','up')")+
      stepper2("Size","stepF('w','dn')","stepF('w','up')","stepF('h','dn')","stepF('h','up')")+
      '<div class="pl">Color</div><div class="cg">'+COLORS.map(function(c){return'<div class="cd" style="background:'+c+'" onclick="bProp(\\'color\\',\\''+c+'\\')"></div>'}).join('')+'</div>';
    if(sel.length>=3&&chainIds()){mh+='<div class="pl">Connection</div><button class="pbtn" id="chain-btn" style="width:100%;background:#6366F1;color:#fff;border-color:#6366F1" title="Connect in the order you clicked" onclick="connChain()">'+chainIds().map(esc).join(' &rarr; ')+'</button>';}
    if(sel.length===2){
      var sa=sel[0].id,sb=sel[1].id,cns=findCB(sa,sb);
      var CC=["#64748B","#6366F1","#8B5CF6","#EC4899","#EF4444","#F59E0B","#22C55E","#3B82F6","#06B6D4","#DC2626","#1E293B","#0F172A"];
      mh+='<div class="pl">Connection</div>';
      if(cns.length===0){
        mh+='<button class="pbtn" id="chain-btn" style="width:100%;background:#6366F1;color:#fff;border-color:#6366F1" title="Connect in the order you clicked" onclick="connTwo(\\''+sa+'\\',\\''+sb+'\\')">'+esc(sa)+' &rarr; '+esc(sb)+'</button>';
        mh+='<div class="pl" style="font-size:9px;margin-top:4px">In the order you clicked. Flip the direction, set color, width and label after connecting</div>';
      }else{
        var cn=cns[0],fa=cn.from,ta=cn.to;
        mh+='<div style="padding:4px 6px;background:var(--bg);border-radius:4px;margin-bottom:6px;font-size:11px;color:#ccc;text-align:center">'+esc(fa)+(cn.bidir?' &#x2194; ':' &rarr; ')+esc(ta)+'</div>';
        mh+='<div style="display:flex;gap:3px"><button class="pbtn" style="flex:1" onclick="flipC(\\''+fa+'\\',\\''+ta+'\\')">&#x21C4; Flip</button><button class="pbtn" style="flex:1" onclick="togBi(\\''+fa+'\\',\\''+ta+'\\')">'+(cn.bidir?'&rarr; One-way':'&#x2194; Bidir')+'</button></div>';
        mh+='<div class="pl" style="font-size:9px;margin-top:4px">Label</div><input class="pi" style="width:100%" value="'+esc(cn.label)+'" oninput="sCLb(\\''+fa+'\\',\\''+ta+'\\',this.value)" placeholder="(none)">';
        mh+='<div class="pl" style="font-size:9px;margin-top:4px">Label Pos</div><div style="display:flex;gap:3px">'+[["right","右"],["left","左"],["top","上"],["bottom","下"],["center","中"]].map(function(pv){return'<button class="sbtn'+(cn.lpos===pv[0]?' act':'')+'" onclick="setCP(\\''+fa+'\\',\\''+ta+'\\',\\'lpos\\',\\''+pv[0]+'\\')">'+pv[1]+'</button>'}).join('')+'</div>';
        mh+='<div class="pl" style="font-size:9px;margin-top:4px">Line Color</div><div class="cg">'+CC.map(function(c){return'<div class="cd'+(cn.color===c?' act':'')+'" style="background:'+c+'" onclick="setCC(\\''+fa+'\\',\\''+ta+'\\',\\''+c+'\\')"></div>'}).join('')+'</div>';
        mh+='<div class="pl" style="font-size:9px;margin-top:4px">Width</div><div style="display:flex;gap:3px">'+[1,1.5,2,3,4].map(function(w){return'<button class="sbtn'+(cn.width===w?' act':'')+'" onclick="setCP(\\''+fa+'\\',\\''+ta+'\\',\\'width\\',\\''+w+'\\')">'+w+'</button>'}).join('')+'</div>';
        mh+='<div class="pl" style="font-size:9px;margin-top:4px">Style</div><div style="display:flex;gap:3px">'+["solid","dashed"].map(function(st){return'<button class="sbtn'+(cn.style===st?' act':'')+'" onclick="setCP(\\''+fa+'\\',\\''+ta+'\\',\\'style\\',\\''+st+'\\')">'+window.StableBlockTerms.styleName(st,'en')+'</button>'}).join('')+'</div>';
        mh+='<button class="pbtn" style="border-color:#c44;color:#faa;margin-top:4px;width:100%" onclick="rmConn(\\''+fa+'\\',\\''+ta+'\\')">Remove Connection</button>';
      }
    }
    mh+='<button class="pbtn" style="border-color:#8B5CF6;color:#C4B5FD;margin-top:8px" onclick="grpSel()">Group Selected</button>';
    mh+='<button class="pbtn" style="border-color:#c44;color:#faa;margin-top:12px" onclick="bDel()">Delete All</button>';
    el.innerHTML=mh;
    return;
  }
  var si=sel[0],it=getIt(si);if(!it){sel=[];props();return;}
  var isB=it.type==="block";
  var isN=it.type==="note";
  var typeLabel=window.StableBlockTerms.typeName(it.type,'en');
  var typeColor=isN?'#F59E0B':isB?'#A5B4FC':'#C4B5FD';
  var colors=isN?NOTE_COLORS:isB?COLORS:BG_COLORS;
  var h='<div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:11px;font-weight:700;color:'+typeColor+'">'+typeLabel+'</span><span onclick="sel=[];render();props()" style="cursor:pointer;color:#888;font-size:14px">&times;</span></div>';
  h+='<div class="pl" id="dup-hint" style="margin-top:4px;font-size:9px">Duplicate: Ctrl+C &rarr; Ctrl+V (same size/colors, next free spot) / Esc: tools</div>';
  var incN=window.StableBlockCheck.includedItemNote(EXP,it.line,function(f){return f.split('/').pop();},'en');
  if(incN)h+='<div class="pl" id="prop-included" style="margin-top:4px;font-size:9px;text-transform:none;color:#FCD34D">'+esc(incN)+'</div>';
  h+='<div class="pl">'+(isN?'Text':'Label')+'</div>'+(isN?'<textarea class="pi" id="note-text" style="height:80px;resize:vertical;font-size:11px;line-height:1.4" oninput="sNLb(this.value)">'+it.label.split("\\\\n").join("\\n")+'</textarea>':'<input class="pi" value="'+esc(it.label)+'" oninput="sLb(this.value)" onkeydown="if(event.key===\\'Enter\\'){this.blur();askId();}">');
  h+='<details id="prop-id-box"'+(window.StableBlockLabel.idFieldOpen(it.id,idOpen)?' open':'')+'><summary class="pl" style="cursor:pointer;text-transform:none" title="Change the ID (connections follow). The ID follows the label automatically" onclick="idOpen=!this.parentNode.open">ID: <span id="prop-id-now">'+esc(it.id)+'</span></summary><input class="pi" id="prop-id" value="'+esc(it.id)+'" onchange="sId(this.value)" onkeydown="idKey(event,this)" spellcheck="false"><div id="prop-id-msg" style="font-size:9px;color:#F87171"></div><div id="prop-id-help" style="font-size:9px;color:#888">Letters, digits and _. Connections follow.</div></details>';
  h+=stepperRow("X","stepF(\\'x\\',\\'dn\\')","stepF(\\'x\\',\\'up\\')",it.x)+stepperRow("Y","stepF(\\'y\\',\\'dn\\')","stepF(\\'y\\',\\'up\\')",it.y);
  h+=stepperRow("W","stepF(\\'w\\',\\'dn\\')","stepF(\\'w\\',\\'up\\')",it.w)+stepperRow("H","stepF(\\'h\\',\\'dn\\')","stepF(\\'h\\',\\'up\\')",it.h);
  h+='<div class="pl">Color</div><div class="cg">'+colors.map(function(c){return'<div class="cd'+(it.color===c?' act':'')+'" style="background:'+c+'" onclick="sPr(\\'color\\',\\''+c+'\\')"></div>'}).join('')+'</div>';
  h+='<input class="pi" style="width:80px" value="'+it.color+'" oninput="sPr(\\'color\\',this.value)">';
  if(isB||isN){
    h+='<div class="pl">Text Color</div><div class="cg">'+["#FFFFFF","#000000","#1E293B","#F8FAFC","#92400E","#991B1B","#1E40AF","#166534"].map(function(c){return'<div class="cd'+(it.textColor===c?' act':'')+'" style="background:'+c+'" onclick="sPr(\\'text\\',\\''+c+'\\')"></div>'}).join('')+'</div>';
    h+=stepperRow("Round","sNudgeR(-1)","sNudgeR(1)",it.round);
  }
  if(isB||isN){
    h+='<div class="pl">Style</div><div style="display:flex;gap:3px">'+["solid","dashed","bold"].map(function(s){return'<button class="sbtn'+(it.style===s?' act':'')+'" onclick="sPr(\\'style\\',\\''+s+'\\')">'+window.StableBlockTerms.styleName(s,'en')+'</button>'}).join('')+'</div>';
  }
  if(!isB&&!isN){
    h+='<div class="pl">Border</div><div class="cg">'+COLORS.map(function(c){return'<div class="cd'+(it.borderColor===c?' act':'')+'" style="background:'+c+'" onclick="sPr(\\'border\\',\\''+c+'\\')"></div>'}).join('')+'</div>';
    h+='<button class="pbtn" style="background:#6366F1;color:#fff;border-color:#6366F1;margin-top:8px" data-term="add-block-in-group" onclick="addBlockInGroup()" title="Add a block inside this group, right of its last block (same size and color)">+ Block in Group</button>';
  }
  h+='<button class="pbtn" style="border-color:#c44;color:#faa;margin-top:12px" onclick="sDel()">Delete</button>';
  el.innerHTML=h;
}

function stepperRow(label,decF,incF,val){
  return '<div class="pl">'+label+'</div><div class="stepper" style="margin-bottom:4px"><input class="pi" type="number" value="'+val+'" oninput="sField(\\''+label.toLowerCase()+'\\',this.value)"><div class="stcol"><button class="stb up" onclick="'+incF+'">&#x25B2;</button><button class="stb dn" onclick="'+decF+'">&#x25BC;</button></div></div>';
}
function stepper2(label,xd,xi,yd,yi){
  return '<div class="pl">'+label+'</div><div class="pr"><div style="flex:1"><div style="font-size:8px;color:#888">X</div><div class="stepper"><input class="pi" value="" disabled><div class="stcol"><button class="stb up" onclick="'+xi+'">&#x25B2;</button><button class="stb dn" onclick="'+xd+'">&#x25BC;</button></div></div></div><div style="flex:1"><div style="font-size:8px;color:#888">Y</div><div class="stepper"><input class="pi" value="" disabled><div class="stcol"><button class="stb up" onclick="'+yi+'">&#x25B2;</button><button class="stb dn" onclick="'+yd+'">&#x25BC;</button></div></div></div></div>';
}

// Single-item actions
function sPr(p,v){if(!sel.length)return;pushH();upPr(sel[0].type,sel[0].id,p,v);go();notify();}
function sLb(v){if(!sel.length)return;pushH();upLb(sel[0].type,sel[0].id,v);fLbId(v);parsed=parseDoc();render();
  showErr();
  document.getElementById('stats').textContent='Blocks:'+parsed.blocks.length+' Groups:'+parsed.groups.length+' Notes:'+parsed.notes.length+' Conn:'+parsed.connections.length+' Sel:'+sel.length;
  document.getElementById('si').textContent=sel.length?sel.length+' selected':'Click to select';notify();}
function sCLb(a,b,v){pushH();dsl=window.StableBlockLabel.setConnLabelInDsl(dsl,a,b,v);parsed=parseDoc();render();notify();}
function sNLb(v){if(!sel.length)return;pushH();upLb(sel[0].type,sel[0].id,v.replace(/\\n/g,"\\\\n"));fLbId(v);parsed=parseDoc();render();notify();}
function sField(f,v){if(!sel.length)return;var n=parseInt(v);if(isNaN(n))return;pushH();var it=getIt(sel[0]);if(!it)return;
  if(f==='x'||f==='y')upP(sel[0].type,sel[0].id,f==='x'?Math.max(0,n):it.x,f==='y'?Math.max(0,n):it.y);
  else if(f==='w'||f==='h')upS(sel[0].type,sel[0].id,f==='w'?Math.max(1,n):it.w,f==='h'?Math.max(1,n):it.h);
  else if(f==='round')upPr(sel[0].type,sel[0].id,'round',Math.max(0,n));
  go();notify();}
function sNudge(ax,d){if(!sel.length)return;pushH();var s=sel[0],it=getIt(s);if(!it)return;var before=parNow();
  if(s.type==='group'){var ch=fCh(it);ch.cb.forEach(function(b){upP('block',b.id,b.x+(ax==='x'?d:0),b.y+(ax==='y'?d:0))});ch.cg.forEach(function(g){upP('group',g.id,g.x+(ax==='x'?d:0),g.y+(ax==='y'?d:0))});}
  upP(s.type,s.id,Math.max(0,it.x+(ax==='x'?d:0)),Math.max(0,it.y+(ax==='y'?d:0)));growPar(before,[{id:s.id,sides:axSides(ax,d)}]);go();notify();}
function sNudgeSz(ax,d){if(!sel.length)return;pushH();var it=getIt(sel[0]);if(!it)return;var before=parNow();upS(sel[0].type,sel[0].id,ax==='w'?Math.max(1,it.w+d):it.w,ax==='h'?Math.max(1,it.h+d):it.h);growPar(before,[{id:sel[0].id,sides:axSides(ax==='w'?'x':'y',d)}]);go();notify();}
// プロパティ欄の X / Y / W / H の ▲▼(core/select stepDelta): ▲ は値を増やす。1 つ選択と複数選択で同じ向き
function stepF(f,btn){var d=window.StableBlockSelect.stepDelta(btn);if(!sel.length||!d)return;
  if(f==='x'||f==='y'){if(sel.length>1)bNudge(f,d);else sNudge(f,d);}
  else if(sel.length>1)bNudgeSz(f,d);else sNudgeSz(f,d);}
function sNudgeR(d){if(!sel.length)return;var it=parsed.blockMap[sel[0].id]||parsed.nm[sel[0].id];if(!it)return;pushH();upPr(sel[0].type,sel[0].id,'round',Math.max(0,it.round+d));go();notify();}
function sDel(){if(!sel.length)return;pushH();delItems(sel);sel=[];go();notify();}

// Batch actions
function bNudge(ax,d){pushH();var before=parNow();sel.forEach(function(si){var it=getIt(si);if(!it)return;if(si.type==='group'){var ch=fCh(it);ch.cb.forEach(function(b){upP('block',b.id,Math.max(0,b.x+(ax==='x'?d:0)),Math.max(0,b.y+(ax==='y'?d:0)))});ch.cg.forEach(function(g){upP('group',g.id,Math.max(0,g.x+(ax==='x'?d:0)),Math.max(0,g.y+(ax==='y'?d:0)))});}upP(si.type,si.id,Math.max(0,it.x+(ax==='x'?d:0)),Math.max(0,it.y+(ax==='y'?d:0)));});growPar(before,sel.map(function(si){return{id:si.id,sides:axSides(ax,d)}}));go();notify();}
function bNudgeSz(ax,d){pushH();var before=parNow();sel.forEach(function(si){var it=getIt(si);if(!it)return;upS(si.type,si.id,ax==='w'?Math.max(1,it.w+d):it.w,ax==='h'?Math.max(1,it.h+d):it.h);});growPar(before,sel.map(function(si){return{id:si.id,sides:axSides(ax==='w'?'x':'y',d)}}));go();notify();}
function bProp(p,v){pushH();sel.forEach(function(si){upPr(si.type,si.id,p,v)});go();notify();}
function bDel(){pushH();delItems(sel);sel=[];go();notify();}

function delItems(items){items.forEach(function(si){var lines=dsl.split("\\n"),re=new RegExp("^\\\\s*"+si.type+"\\\\s+"+si.id+"\\\\s+"),c1=new RegExp("(^|\\\\s)"+si.id+"(\\\\s+(-->|->)\\\\s+|$)"),c2=new RegExp("\\\\s+(-->|->)\\\\s+"+si.id+"(\\\\s|$)");dsl=lines.filter(function(l){return !re.test(l)&&!c1.test(l)&&!c2.test(l)}).join("\\n");});}

// Copy / Cut / Paste
var clipboard=null,clipConns=[];
function getLine(tp,id){var lines=dsl.split("\\n"),re=new RegExp("^\\\\s*"+tp+"\\\\s+"+id+"\\\\s+");for(var i=0;i<lines.length;i++){if(re.test(lines[i]))return lines[i].trim();}return null;}
function copySel(){if(!sel.length)return;clipboard=sel.map(function(si){var ln=getLine(si.type,si.id);return ln?{type:si.type,id:si.id,line:ln}:null;}).filter(Boolean);clipConns=window.StableBlockLabel.connLinesAmong(dsl,clipboard.map(function(ci){return ci.id}));lastPaste=null;}
function cutSel(){if(!sel.length)return;copySel();pushH();delItems(sel);sel=[];go();notify();}
function pasteSel(){if(!clipboard||!clipboard.length)return;var rects=clipboard.map(function(ci){var m=ci.line.match(/at\\s+([\\d.]+),([\\d.]+)\\s+size\\s+([\\d.]+)x([\\d.]+)/);return m?{x:+m[1],y:+m[2],w:+m[3],h:+m[4]}:null;}).filter(Boolean);if(!rects.length)return;var bx=Math.min.apply(null,rects.map(function(r){return r.x})),by=Math.min.apply(null,rects.map(function(r){return r.y}));var bw=Math.max.apply(null,rects.map(function(r){return r.x+r.w}))-bx,bh=Math.max.apply(null,rects.map(function(r){return r.y+r.h}))-by;pushH();var skip={};clipboard.forEach(function(ci){skip[ci.id]=1});var src={x:bx,y:by,w:bw,h:bh};var p=areaSlot(bw,bh,lastPaste||src,groupOf(src,skip));var dx=p.x-bx,dy=p.y-by;var ns=[],idMap={};clipboard.forEach(function(ci){var nid="__new_"+(addC++);idMap[ci.id]=nid;var ln=ci.line.replace(new RegExp("^("+ci.type+"\\\\s+)"+ci.id),"$1"+nid);ln=ln.replace(/at\\s+([\\d.]+),([\\d.]+)/,function(m,x,y){return"at "+(+x+dx)+","+(+y+dy)});dsl=dsl.trimEnd()+"\\n"+ln+"\\n";ns.push({type:ci.type,id:nid});});clipConns.forEach(function(l){var nl=window.StableBlockLabel.remapConnLine(l,idMap);if(nl)dsl=dsl.trimEnd()+"\\n"+nl+"\\n";});lastPaste={x:p.x,y:p.y,w:bw,h:bh};sel=ns;go();notify();}

// Connection management (two-select)
function findCB(a,b){return parsed.connections.filter(function(c){return(c.from===a&&c.to===b)||(c.from===b&&c.to===a)});}
function connTwo(a,b){pushH();dsl=dsl.trimEnd()+"\\n"+a+" -> "+b+"\\n";go();notify();}
// 鎖状に結ぶ: クリックした順に block / note を選んだとき。既にある組は足さない(core/label chainConnectInDsl。HTML 版と同じ)
function chainIds(){if(!selClk||sel.length<2||sel.some(function(x){return x.type==='group'}))return null;var ids=sel.map(function(x){return x.id});return window.StableBlockLabel.chainConnectInDsl('',ids,parsed.connections).added.length?ids:null;}
function connChain(){var ids=chainIds();if(!ids)return;var r=window.StableBlockLabel.chainConnectInDsl(dsl,ids,parsed.connections);pushH();dsl=r.dsl;go();notify();}
function rmConn(a,b){pushH();var lines=dsl.split("\\n");dsl=lines.filter(function(l){var m=l.trim().match(/^(\\S+)\\s+(-->|->)\\s+(\\S+)/);if(!m)return true;return!((m[1]===a&&m[3]===b)||(m[1]===b&&m[3]===a));}).join("\\n");go();notify();}
function flipC(a,b){pushH();var lines=dsl.split("\\n");for(var i=0;i<lines.length;i++){var m=lines[i].trim().match(/^(\\S+)(\\s+)(-->|->)(\\s+)(\\S+)(.*)/);if(!m)continue;if((m[1]===a&&m[5]===b)||(m[1]===b&&m[5]===a)){lines[i]=lines[i].replace(/^(\\s*)(\\S+)(\\s+)(-->|->)(\\s+)(\\S+)/,function(_,sp,f,s1,ar,s2,t){return sp+t+s1+ar+s2+f;});break;}}dsl=lines.join("\\n");go();notify();}
function togBi(a,b){pushH();var lines=dsl.split("\\n");for(var i=0;i<lines.length;i++){var m=lines[i].trim().match(/^(\\S+)\\s+(-->|->)\\s+(\\S+)/);if(!m)continue;if((m[1]===a&&m[3]===b)||(m[1]===b&&m[3]===a)){lines[i]=m[2]==='-->'?lines[i].replace('-->','->'):lines[i].replace('->','-->');break;}}dsl=lines.join("\\n");go();notify();}
function setCP(a,b,prop,val){pushH();var lines=dsl.split("\\n"),pr=new RegExp(prop+"=\\\\S+");for(var i=0;i<lines.length;i++){var m=lines[i].trim().match(/^(\\S+)\\s+(-->|->)\\s+(\\S+)/);if(!m)continue;if((m[1]===a&&m[3]===b)||(m[1]===b&&m[3]===a)){lines[i]=pr.test(lines[i])?lines[i].replace(pr,prop+"="+val):lines[i].trimEnd()+" "+prop+"="+val;break;}}dsl=lines.join("\\n");go();notify();}
function setCC(a,b,col){setCP(a,b,"color",col);}

// Add
function freeSlot(w,h){return window.StableBlockLayout.findFreeSlot(parsed.blocks.concat(parsed.groups,parsed.notes),w,h,{cols:Math.floor(parsed.canvas.width/parsed.canvas.grid)});}
function blockLine(id,p,src){var w=src?src.w:8,h=src?src.h:3;var l='block '+id+' "New Block" at '+p.x+','+p.y+' size '+w+'x'+h+' color='+(src?src.color:'#3B82F6')+' text='+(src?src.textColor:'#FFFFFF')+' round='+(src?src.round:4);if(src&&src.borderColor)l+=' border='+src.borderColor;if(src&&src.style&&src.style!=='solid')l+=' style='+src.style;return l;}
function groupOf(r,skip){return parsed.groups.filter(function(g){return !(skip&&skip[g.id])&&isIn(r,g)}).sort(function(a,b){return a.w*a.h-b.w*b.h})[0]||null;}
function areaSlot(w,h,prev,gr){var L=window.StableBlockLayout,all=parsed.blocks.concat(parsed.groups,parsed.notes);if(!gr)return L.placeNext(all,w,h,{prev:prev,cols:Math.floor(parsed.canvas.width/parsed.canvas.grid)});var p=L.placeInGroupFit(all,gr,w,h,prev);p.changes.forEach(function(r){upP(r.type,r.id,r.x,r.y);if(r.type==='group')upS('group',r.id,r.w,r.h);});if(p.changes.length)parsed=parseDoc();return p;}
function outerGroup(r){return parsed.groups.filter(function(g){return isIn(r,g)}).sort(function(a,b){return b.w*b.h-a.w*a.h})[0]||null;}
function addBlock(){pushH();var id="__new_"+(addC++),prev=(lastAddedId&&parsed.blockMap[lastAddedId])||null;var p=areaSlot(prev?prev.w:8,prev?prev.h:3,prev&&(outerGroup(prev)||prev),null);dsl=dsl.trimEnd()+"\\n"+blockLine(id,p,prev)+"\\n";lastAddedId=id;sel=[{type:"block",id:id}];go();notify();}
function addBlockInGroup(gid){if(!gid&&sel.length===1&&sel[0].type==='group')gid=sel[0].id;var gr=parsed.groupMap[gid];if(!gr)return;pushH();var id="__new_"+(addC++);var L=window.StableBlockLayout;var prev=lastAddedId&&parsed.blockMap[lastAddedId];if(!prev||L.parentMap(boxIt())[prev.id]!==gr.id)prev=L.lastChildBlock(boxIt(),gr);var p=areaSlot(prev?prev.w:8,prev?prev.h:3,prev,gr);dsl=dsl.trimEnd()+"\\n"+blockLine(id,p,prev)+"\\n";lastAddedId=id;sel=[{type:"block",id:id}];go();notify();}
function addGroup(){pushH();var id="__new_"+(addC++),p=freeSlot(20,8);dsl=dsl.trimEnd()+"\\ngroup "+id+' "New Group" at '+p.x+','+p.y+' size 20x8 color=#F1F5F9 border=#94A3B8\\n';sel=[{type:"group",id:id}];go();notify();}
function addNote(){pushH();var id="__new_"+(addC++),p=freeSlot(8,2);dsl=dsl.trimEnd()+"\\nnote "+id+' "Annotation" at '+p.x+','+p.y+' size 8x2 color=#FEF3C7 text=#92400E\\n';sel=[{type:"note",id:id}];if(!showAnno){showAnno=true;var abtn=document.getElementById('anno-btn');if(abtn)abtn.classList.add('anno-act');}go();notify();}
// ID: set in the property panel (sId). Renames touch only the definition line and connection endpoints (core/label renameIdInDsl).
// __new_ items and IDs auto-assigned here (autoIds) follow the label as it is typed (fLbId). IDs of loaded diagrams never follow.
var autoIds=new Set();
function usedEx(id){var u=new Set();parsed.blocks.concat(parsed.groups).concat(parsed.notes).forEach(function(x){if(x.id!==id)u.add(x.id);});return u;}
function applyRn(s,nid){var it=getIt(s);var dup=parsed.blocks.concat(parsed.groups).concat(parsed.notes).filter(function(x){return x.id===s.id;}).length>1;var out=window.StableBlockLabel.renameIdInDsl(dsl,s.id,nid,dup&&it&&EXP&&EXP.origin[it.line-1]&&EXP.origin[it.line-1].file===EXP.file?EXP.origin[it.line-1].line:undefined);if(out===dsl)return false;dsl=out;sel=sel.map(function(x){return x.id===s.id?{type:x.type,id:nid}:x;});return true;}
// Fix IDs (toolbar): give every element still on a placeholder ID (__new_) an ID from its label in one go (core/label fixPlaceholderIdsInDsl, same as the HTML version's ID補正)
function fixIds(){if(!parsed)return;var SL=window.StableBlockLabel,all=parsed.blocks.concat(parsed.groups).concat(parsed.notes);
  function own(it){var o=EXP&&EXP.origin[it.line-1];return o?(o.file===EXP.file?o.line:null):it.line;}
  var items=all.filter(function(it){return SL.isPlaceholderId(it.id)&&own(it)!=null;}).map(function(it){return {id:it.id,label:it.label,line:own(it)};});
  if(!items.length){vscodeApi.postMessage({type:'info',text:'Fix IDs: no element is on a placeholder ID (__new_)'});return;}
  var r=SL.fixPlaceholderIdsInDsl(dsl,items,all.map(function(x){return x.id;}));
  if(r.renamed.length){pushH();dsl=r.dsl;sel=sel.map(function(x){var m=r.renamed.filter(function(y){return y.from===x.id;})[0];return m?{type:x.type,id:m.to}:x;});r.renamed.forEach(function(x){autoIds.delete(x.from);});go();notify();}
  vscodeApi.postMessage({type:'info',text:'Fix IDs: '+r.renamed.length+' renamed'+(r.renamed.length?' ('+r.renamed.map(function(x){return x.from+' -> '+x.to;}).join(', ')+')':'')+(r.left.length?'. '+r.left.length+' label(s) without letters or digits keep the placeholder: set them in the ID field':'')});}
function sId(v){if(!sel.length)return;var s=sel[0],nv=String(v).trim(),msg=document.getElementById('prop-id-msg');if(nv===s.id){if(msg)msg.textContent='';return;}var SL=window.StableBlockLabel;var err=!SL.isValidId(nv)?'Letters, digits and _ only':usedEx(s.id).has(nv)?'"'+nv+'" is already used':'';if(err){if(msg)msg.textContent=err;return;}pushH();if(!applyRn(s,nv)){if(msg)msg.textContent='Defined outside this file (@include)';return;}autoIds.delete(s.id);go();notify();}
// Enter on a label that still leaves a placeholder ID (__new_: the label has no letters or digits to make one from) moves to the ID field
// (type + Enter to set it, Esc to leave it for later; Tab keeps going to the next item). Leftover placeholder IDs are listed as warnings (core/check)
function askId(){var s=sel.length===1?sel[0]:null;if(!s||!window.StableBlockLabel.isPlaceholderId(s.id))return false;var box=document.getElementById('prop-id-box'),inp=document.getElementById('prop-id');if(!box||!inp)return false;box.open=true;var help=document.getElementById('prop-id-help');if(help)help.textContent='No ID could be made from the label. Type one (letters, digits, _) + Enter, or Esc for later';inp.focus();inp.select();return true;}
function idKey(e,inp){if(e.key==='Enter'){e.preventDefault();sId(inp.value);var msg=document.getElementById('prop-id-msg');if(document.body.contains(inp)&&msg&&msg.textContent){inp.select();return;}inp.blur();}else if(e.key==='Escape'&&sel[0])inp.value=sel[0].id;}
function fLbId(label){var s=sel[0];if(!s||!(s.id.indexOf('__new_')===0||autoIds.has(s.id)))return;var SL=window.StableBlockLabel;var base=SL.labelToId(label);if(!base)return;var nid=SL.uniqueId(base,usedEx(s.id));if(nid===s.id)return;if(!applyRn(s,nid))return;autoIds.delete(s.id);autoIds.add(nid);var inp=document.getElementById('prop-id');if(inp)inp.value=nid;var now=document.getElementById('prop-id-now');if(now)now.textContent=nid;}

// Group selected blocks
function grpSel(){var its=sel.map(function(si){return getIt(si)}).filter(function(x){return x&&x.type!=='note'});if(its.length<2)return;pushH();var L=window.StableBlockLayout;var bx=Math.min.apply(null,its.map(function(b){return b.x})),by=Math.min.apply(null,its.map(function(b){return b.y}));var box={type:'block',id:' sel',x:bx,y:by,w:Math.max.apply(null,its.map(function(b){return b.x+b.w}))-bx,h:Math.max.apply(null,its.map(function(b){return b.y+b.h}))-by};var pid=L.parentMap(parsed.groups.concat([box]))[box.id],parent=pid?parsed.groupMap[pid]:null;var r=L.groupRectFor(its,boxIt().filter(function(x){return its.indexOf(x)<0}),parent);var id="__new_"+(addC++);dsl=dsl.trimEnd()+"\\ngroup "+id+' "Group" at '+r.x+','+r.y+' size '+r.w+'x'+r.h+' color=#F1F5F9 border=#94A3B8\\n';parsed=parseDoc();var after=parNow();if(pid)after[id]=pid;its.forEach(function(b){after[b.id]=id;});growPar(after,[{id:id,sides:['l','t','r','b']}],[{id:id,from:{x:r.x,y:r.y,w:box.x+box.w-r.x,h:box.y+box.h-r.y}}]);go();notify();}

// Search / Filter
function matchSearch(item){if(!searchQ)return true;var q=searchQ.toLowerCase();if(item.id&&item.id.toLowerCase().indexOf(q)>=0)return true;if(item.label&&item.label.toLowerCase().indexOf(q)>=0)return true;if(item.from&&item.from.toLowerCase().indexOf(q)>=0)return true;if(item.to&&item.to.toLowerCase().indexOf(q)>=0)return true;return false;}
function doSearch(q){searchQ=q.trim();render();}
// 検索の当たり(HTML 版と同じ core/render の searchMatches / nextMatch)。件数を検索欄の横に出し、Enter / Shift+Enter で読み順に 1 つずつ選ぶ
function searchNow(){return parsed?window.StableBlockRender.searchMatches(parsed,searchQ,{showAnnotations:showAnno}):[];}
function searchCount(){var el=document.getElementById('search-count');if(el)el.textContent=searchQ?' '+searchNow().length+(searchNow().length===1?' match':' matches'):'';}
function searchStep(dir){var t=window.StableBlockRender.nextMatch(searchNow(),sel.length===1?sel[0]:null,dir);if(!t)return;sel=[t];render();props();
  var g=[].slice.call(document.querySelectorAll('#wrap g[data-id]')).filter(function(x){return x.getAttribute('data-id')===t.id&&x.getAttribute('data-type')===t.type})[0];if(g&&g.scrollIntoView)g.scrollIntoView({block:'nearest',inline:'nearest'});}

// Mermaid export
function exportMmd(){if(!parsed)return;var r=window.StableBlockMermaid.toMermaid(parsed),dr=incDrops().concat(r.dropped);vscodeApi.postMessage({type:'exportMmd',data:r.text});if(dr.length)vscodeApi.postMessage({type:'exportDrops',format:'Mermaid',items:dr});}

// Refresh
// エラー表示: 読めない行の理由・存在しない ID への接続(error)、block の重なり・線の横切り・同じ組の 2 本目(warn)。判定は core/check
var lastDiag=[];
function showErr(){var p={canvas:parsed.canvas,blocks:parsed.blocks,groups:parsed.groups,notes:parsed.notes,connections:parsed.connections,errors:parsed.errors,blockMap:parsed.blockMap,groupMap:parsed.groupMap,noteMap:parsed.nm};var SBL=window.StableBlockLabel,paths=SBL.connectionPaths(p);lastDiag=window.StableBlockCheck.checkIncluded(p,EXP,paths,{hint:'(ファイルが無い)',labelIssues:SBL.labelIssues(SBL.placeLabels(paths,p,measureLabel),p)});var hasErr=lastDiag.some(function(d){return d.level==='error'});document.getElementById('err').innerHTML=lastDiag.length?'<div class="error'+(hasErr?'':' warn-only')+'">'+lastDiag.map(function(d){return '<div class="dg-'+d.level+'">L'+d.line+': '+esc(d.msg)+'</div>'}).join('')+'</div>':'';}
function go(){parsed=parseDoc();render();props();
  showErr();
  document.getElementById('stats').textContent='Blocks:'+parsed.blocks.length+' Groups:'+parsed.groups.length+' Notes:'+parsed.notes.length+' Conn:'+parsed.connections.length+' Sel:'+sel.length;
  document.getElementById('si').textContent=sel.length?sel.length+' selected':'Click to select';}

// Export
// 書き出し(SVG / PNG / 透過PNG / PNGをコピー)は本文だけで決まる絵(core/render exportSvg)。画面の選択・ハンドル・グリッド・薄め・表示倍率は入らない
function exportSvgText(){return parsed?window.StableBlockRender.exportSvg(parsed,window.StableBlockLabel,measureLabel,SVG_FONT):null;}
function exportSVG(){var svg=exportSvgText();if(!svg)return;vscodeApi.postMessage({type:'exportSVG',data:svg});sendIncDrops('SVG');}
function sendIncDrops(fmt){var d=incDrops();if(d.length)vscodeApi.postMessage({type:'exportDrops',format:fmt,items:d});}
function pngCanvas(transparent,cb){var d=exportSvgText();if(!d)return;var size=window.StableBlockRender.exportPngSize(parsed.canvas),img=new Image();img.onload=function(){var c=document.createElement('canvas');c.width=size.width;c.height=size.height;var ctx=c.getContext('2d');if(!transparent){ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);}ctx.drawImage(img,0,0,c.width,c.height);cb(c);};img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(d)));}
function exportPNG(){pngCanvas(false,function(c){vscodeApi.postMessage({type:'exportPNG',data:c.toDataURL('image/png')});sendIncDrops('PNG');});}
// PNG's ▾: transparent background / copy to the clipboard (opens under PNG, focuses the first item, Esc or a press outside closes it)
function closePngMenu(){var m=document.getElementById('png-menu');if(m)m.hidden=true;}
function openPngMenu(btn){var m=document.getElementById('png-menu');if(!m.hidden){m.hidden=true;return;}var r=(btn.previousElementSibling||btn).getBoundingClientRect();m.style.left=Math.round(r.left)+'px';m.style.top=Math.round(r.bottom+4)+'px';m.hidden=false;m.querySelector('button').focus();}
function pngMenuDo(fn){closePngMenu();fn();}
document.addEventListener('mousedown',function(e){if(!(e.target.closest&&e.target.closest('#png-menu,#png-more')))closePngMenu();});
function exportPNGT(){pngCanvas(true,function(c){vscodeApi.postMessage({type:'exportPNG',data:c.toDataURL('image/png')});sendIncDrops('PNG');});}
function copyPNG(){pngCanvas(false,function(c){c.toBlob(function(blob){if(blob&&navigator.clipboard&&navigator.clipboard.write){navigator.clipboard.write([new ClipboardItem({'image/png':blob})]).then(function(){vscodeApi.postMessage({type:'info',text:'PNG copied to clipboard'});}).catch(function(){vscodeApi.postMessage({type:'info',text:'Clipboard copy failed'});});}else{vscodeApi.postMessage({type:'info',text:'Clipboard API not available'});}});});}
function exportXlsx(){
  try{
    if(!parsed){vscodeApi.postMessage({type:'info',text:'図がパースされていません'});return;}
    if(!window.StableBlockExcel||!window.JSZip){vscodeApi.postMessage({type:'info',text:'Excel エクスポート用モジュール未ロード'});return;}
    window.StableBlockExcel.renderXlsx(parsed,{JSZip:window.JSZip,templateFiles:window.StableBlockTemplateFiles}).then(function(bytes){
      var binary='';for(var i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);
      var b64=btoa(binary);
      vscodeApi.postMessage({type:'exportXlsx',data:b64});
      var drops=incDrops().concat(window.StableBlockExcel.listXlsxDrops(parsed));if(drops.length)vscodeApi.postMessage({type:'exportDrops',format:'Excel',items:drops});
    }).catch(function(e){vscodeApi.postMessage({type:'info',text:'Excel エクスポート失敗: '+e.message});});
  }catch(e){vscodeApi.postMessage({type:'info',text:'Excel エクスポート失敗: '+e.message});}
}
function setZm(z){zm=z;document.getElementById('zl').textContent=Math.round(zm*100)+'%';render();}
function sz(d){setZm(window.StableBlockLayout.stepZoom(zm,d));}
function fitV(){if(!parsed)return;var a=document.getElementById('preview');setZm(window.StableBlockLayout.fitZoom(parsed.canvas.width,parsed.canvas.height,a.clientWidth-18,a.clientHeight-18));}

// Keyboard
document.addEventListener('keydown',function(e){
  var inInput=document.activeElement&&(document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA');
  if(e.key==='Escape'){closePngMenu();if(inInput)document.activeElement.blur();clrSel();return;}
  if(inInput)return;
  if(e.key==='h'||e.key==='H'){e.preventDefault();toggleHL();return;}
  if(e.key==='n'||e.key==='N'){e.preventDefault();toggleAnno();return;}
  if((e.key==='f'||e.key==='F')&&!e.ctrlKey&&!e.metaKey){e.preventDefault();fitV();return;}
  var tg=e.target&&e.target.tagName;if((tg==='INPUT'||tg==='TEXTAREA'||tg==='SELECT'))return;
  if((e.key==='F2'||(e.key==='Enter'&&!(document.activeElement&&document.activeElement.tagName==='BUTTON')&&tg!=='BUTTON'))&&sel.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();startInl(sel[0].type,sel[0].id);return;}
  if((e.ctrlKey||e.metaKey)&&e.key==='a'){e.preventDefault();selClk=false;var an=showAnno?parsed.notes.map(function(n){return{type:'note',id:n.id}}):[];sel=parsed.blocks.map(function(b){return{type:'block',id:b.id}}).concat(parsed.groups.map(function(g){return{type:'group',id:g.id}})).concat(an);render();props();return;}
  var an=window.StableBlockSelect.arrowNudge(e.key);if(sel.length&&an){e.preventDefault();if(sel.length>1)bNudge(an.axis,an.d);else sNudge(an.axis,an.d);return;}
  if(e.key==='Delete'||e.key==='Backspace'){if(!sel.length)return;e.preventDefault();pushH();delItems(sel);sel=[];go();notify();return;}
  if((e.ctrlKey||e.metaKey)&&e.key==='c'){e.preventDefault();copySel();return;}
  if((e.ctrlKey||e.metaKey)&&e.key==='x'){e.preventDefault();cutSel();return;}
  if((e.ctrlKey||e.metaKey)&&e.key==='v'){e.preventDefault();pasteSel();return;}
});
// Clipboard events (fallback if keydown is intercepted by VSCode)
document.addEventListener('copy',function(e){
  var inInput=document.activeElement&&(document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA');
  if(inInput)return;e.preventDefault();copySel();
});
document.addEventListener('cut',function(e){
  var inInput=document.activeElement&&(document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA');
  if(inInput)return;e.preventDefault();cutSel();
});
document.addEventListener('paste',function(e){
  var inInput=document.activeElement&&(document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA');
  if(inInput)return;e.preventDefault();pasteSel();
});

// Messages from extension (forwarded shortcuts that VSCode intercepts)
window.addEventListener('message',function(event){
  var msg=event.data;
  if(msg.type==='undo'){undo();return;}
  if(msg.type==='redo'){redo();return;}
  var inInput=document.activeElement&&(document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA');
  if(inInput)return;
  if(msg.type==='selectAll'){var an=showAnno?parsed.notes.map(function(n){return{type:'note',id:n.id}}):[];sel=parsed.blocks.map(function(b){return{type:'block',id:b.id}}).concat(parsed.groups.map(function(g){return{type:'group',id:g.id}})).concat(an);render();props();return;}
  if(msg.type==='copy'){copySel();return;}
  if(msg.type==='cut'){cutSel();return;}
  if(msg.type==='paste'){pasteSel();return;}
});

document.getElementById('preview').addEventListener('mousedown',function(e){
  if(e.target.closest('#wrap svg'))return;
  var r=e.currentTarget;if(e.target===r&&(e.offsetX>=r.clientWidth||e.offsetY>=r.clientHeight))return;
  relFocus();clrSel();
});
document.getElementById('preview').addEventListener('scroll',function(){if(inl)finInl(true);});

// Drag the preview | side panel border to resize the side panel (core/layout paneWidths keeps a minimum preview width).
// Double-click resets. The width survives hiding the webview (vscodeApi state)
(function(){
  var main=document.querySelector('.main'),pp=document.getElementById('propPanel'),sp=document.getElementById('split-right');
  var OPT={minLeft:0,minMid:200,minRight:160,moved:'right'};
  function apply(w){var r=window.StableBlockLayout.paneWidths(main.clientWidth,0,w,OPT);pp.style.width=r.right+'px';return r.right;}
  function save(){try{var st=vscodeApi.getState()||{};st.propW=pp.getBoundingClientRect().width;vscodeApi.setState(st);}catch(e){}}
  try{var st0=vscodeApi.getState();if(st0&&st0.propW>0)apply(st0.propW);}catch(e){}
  sp.addEventListener('pointerdown',function(e){if(e.button!==0)return;e.preventDefault();sp.focus();
    try{sp.setPointerCapture(e.pointerId);}catch(_){}
    var x0=e.clientX,w0=pp.getBoundingClientRect().width;sp.classList.add('dragging');document.body.classList.add('pane-resizing');
    function mv(ev){apply(w0-(ev.clientX-x0));}
    function up(){sp.removeEventListener('pointermove',mv);sp.removeEventListener('pointerup',up);sp.removeEventListener('pointercancel',up);
      sp.classList.remove('dragging');document.body.classList.remove('pane-resizing');save();}
    sp.addEventListener('pointermove',mv);sp.addEventListener('pointerup',up);sp.addEventListener('pointercancel',up);});
  sp.addEventListener('dblclick',function(e){e.preventDefault();pp.style.width='';try{var st=vscodeApi.getState()||{};delete st.propW;vscodeApi.setState(st);}catch(_){}});
  sp.addEventListener('keydown',function(e){var d=e.key==='ArrowLeft'?-16:e.key==='ArrowRight'?16:0;if(!d)return;e.preventDefault();e.stopPropagation();apply(pp.getBoundingClientRect().width-d);save();});
  window.addEventListener('resize',function(){if(pp.style.width)apply(pp.getBoundingClientRect().width);});
})();

parsed=parseDoc();go();fitV();
<\/script></body></html>`;
}

function deactivate() {}
module.exports = { activate, deactivate };
