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
      }, null, context.subscriptions);
    }

    const updatePreview = () => {
      if (isUpdatingFromWebview) return;
      const doc = vscode.window.activeTextEditor?.document;
      if (doc && (doc.languageId === "stableblock" || doc.fileName.match(/\.(sb|stableblock)$/))) {
        currentPanel.webview.html = getWebviewContent(doc.getText());
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
}

function getWebviewContent(dslText) {
  // Use JSON.stringify to safely inject DSL text — avoids all escaping issues
  const dslJson = JSON.stringify(dslText);

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--vscode-editor-background,#1e1e1e);color:var(--vscode-editor-foreground,#d4d4d4);font-family:var(--vscode-font-family,sans-serif);height:100vh;display:flex;flex-direction:column;overflow:hidden}
.toolbar{display:flex;gap:6px;align-items:center;padding:6px 8px;font-size:12px;flex-wrap:wrap;flex-shrink:0;border-bottom:1px solid var(--vscode-widget-border,#444)}
.tb{padding:3px 10px;font-size:11px;cursor:pointer;background:var(--vscode-button-secondaryBackground,#333);color:var(--vscode-button-secondaryForeground,#ccc);border:1px solid var(--vscode-widget-border,#444);border-radius:3px;font-family:inherit}
.tb:hover{background:var(--vscode-button-secondaryHoverBackground,#444)}
.sep{width:1px;height:14px;background:var(--vscode-widget-border,#444)}
.main{flex:1;display:flex;overflow:hidden}
#preview{flex:1;overflow:auto;padding:8px}
#wrap{background:#fff;border-radius:6px;display:inline-block;line-height:0}
#propPanel{width:200px;border-left:1px solid var(--vscode-widget-border,#444);overflow-y:auto;padding:8px;font-size:11px;flex-shrink:0}
.error{background:var(--vscode-inputValidation-errorBackground,#5a1d1d);color:#f88;padding:4px 8px;border-radius:4px;margin-bottom:6px;font-size:11px}
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
</style></head><body>
<div class="toolbar">
  <button class="tb" onclick="sz(-1)">&minus;</button><span id="zl" style="min-width:36px;text-align:center">100%</span><button class="tb" onclick="sz(1)">+</button>
  <div class="sep"></div><button class="tb" onclick="undo()">&#x21A9;</button><button class="tb" onclick="redo()">&#x21AA;</button>
  <div class="sep"></div><button class="tb" id="hl-btn" onclick="toggleHL()" title="H key">&#x25CE; HL</button>
  <div class="sep"></div><button class="tb" onclick="fixN()" title="Rename __new_ IDs from labels">Fix ID</button>
  <div class="sep"></div><button class="tb" onclick="exportSVG()">SVG</button><button class="tb" onclick="exportPNG()">PNG</button>
  <div class="sep"></div><span id="si" style="font-size:10px;color:var(--vscode-descriptionForeground,#888)"></span>
</div>
<div id="err"></div>
<div class="main"><div id="preview"><div id="wrap"></div></div><div id="propPanel"></div></div>
<div id="stats" class="stats"></div>

<script>
var vscodeApi = acquireVsCodeApi();
var dsl = ${dslJson};
var zm=1,parsed=null,sel=[],hist=[],fut=[],addC=1,highlight=false;
var COLORS=["#6366F1","#8B5CF6","#EC4899","#EF4444","#F59E0B","#D97706","#22C55E","#16A34A","#06B6D4","#3B82F6","#64748B","#DC2626"];
var BG_COLORS=["#EEF2FF","#F5F3FF","#FCE7F3","#FEE2E2","#FEF3C7","#FFF7ED","#DCFCE7","#D1FAE5","#CFFAFE","#DBEAFE","#F1F5F9","#F8FAFC"];

function pushH(){hist.push(dsl);if(hist.length>80)hist.shift();fut.length=0;}
function undo(){if(!hist.length)return;fut.push(dsl);dsl=hist.pop();sel=[];go();notify();}
function redo(){if(!fut.length)return;hist.push(dsl);dsl=fut.pop();sel=[];go();notify();}
function notify(){vscodeApi.postMessage({type:"dslUpdate",dsl});}
function isSel(id){return sel.some(function(s){return s.id===id});}
function getIt(s){return parsed.blockMap[s.id]||parsed.groupMap[s.id];}
function esc(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

function parseDSL(t){
  var ls=t.split("\\n"),cv={width:960,height:640,grid:20},bl=[],gr=[],cn=[],er=[],bm={},gm={};
  for(var i=0;i<ls.length;i++){
    var r=ls[i].trim();if(!r||r.startsWith("#"))continue;var ln=i+1;
    try{
      if(r.startsWith("@canvas")){var w=r.match(/width=(\\d+)/),h=r.match(/height=(\\d+)/),g=r.match(/grid=(\\d+)/);if(w)cv.width=+w[1];if(h)cv.height=+h[1];if(g)cv.grid=+g[1];continue;}
      var m=r.match(/^block\\s+(\\S+)\\s+"([^"]*)"\\s+at\\s+([\\d.]+),([\\d.]+)\\s+size\\s+([\\d.]+)x([\\d.]+)(.*)/);
      if(m){var b={type:"block",id:m[1],label:m[2],x:+m[3],y:+m[4],w:+m[5],h:+m[6],color:(m[7].match(/color=(\\S+)/)||[])[1]||"#3B82F6",textColor:(m[7].match(/text=(\\S+)/)||[])[1]||"#FFFFFF",borderColor:(m[7].match(/border=(\\S+)/)||[])[1]||null,round:+((m[7].match(/round=(\\d+)/)||[])[1]||"4"),style:(m[7].match(/style=(\\S+)/)||[])[1]||"solid",line:ln};bl.push(b);bm[b.id]=b;continue;}
      m=r.match(/^group\\s+(\\S+)\\s+"([^"]*)"\\s+at\\s+([\\d.]+),([\\d.]+)\\s+size\\s+([\\d.]+)x([\\d.]+)(.*)/);
      if(m){var g2={type:"group",id:m[1],label:m[2],x:+m[3],y:+m[4],w:+m[5],h:+m[6],color:(m[7].match(/color=(\\S+)/)||[])[1]||"#F3F4F6",borderColor:(m[7].match(/border=(\\S+)/)||[])[1]||"#9CA3AF",line:ln};gr.push(g2);gm[g2.id]=g2;continue;}
      m=r.match(/^(\\S+)\\s+(-->|->)\\s+(\\S+)\\s*(?:"([^"]*)")?\\s*(.*)/);
      if(m){cn.push({from:m[1],to:m[3],label:m[4]||"",color:(m[5].match(/color=(\\S+)/)||[])[1]||"#64748B",style:(m[5].match(/style=(\\S+)/)||[])[1]||"solid",bidir:m[2]==="-->",line:ln});continue;}
      er.push({line:ln,msg:r.substring(0,40)});
    }catch(e){er.push({line:ln,msg:e.message});}
  }
  return{canvas:cv,blocks:bl,groups:gr,connections:cn,errors:er,blockMap:bm,groupMap:gm};
}

function upP(tp,id,nx,ny){var re=new RegExp("^(\\\\s*"+tp+"\\\\s+)("+id+")(\\\\s+\\"[^\\"]*\\"\\\\s+at\\\\s+)[\\\\d.]+,[\\\\d.]+(\\\\s+size\\\\s+.*)$","m");dsl=dsl.replace(re,"$1$2$3"+nx+","+ny+"$4");}
function upS(tp,id,nw,nh){var re=new RegExp("^(\\\\s*"+tp+"\\\\s+"+id+"\\\\s+\\"[^\\"]*?\\"\\\\s+at\\\\s+[\\\\d.]+,[\\\\d.]+\\\\s+size\\\\s+)[\\\\d.]+x[\\\\d.]+","m");dsl=dsl.replace(re,"$1"+nw+"x"+nh);}
function upPr(tp,id,prop,val){var lines=dsl.split("\\n"),lr=new RegExp("^\\\\s*"+tp+"\\\\s+"+id+"\\\\s+"),pr=new RegExp(prop+"=\\\\S+");for(var i=0;i<lines.length;i++){if(!lr.test(lines[i]))continue;lines[i]=pr.test(lines[i])?lines[i].replace(pr,prop+"="+val):lines[i].trimEnd()+" "+prop+"="+val;break;}dsl=lines.join("\\n");}
function upLb(tp,id,lb){var re=new RegExp("^(\\\\s*"+tp+"\\\\s+"+id+"\\\\s+)\\"[^\\"]*\\"(\\\\s+at\\\\s+.*)$","m");dsl=dsl.replace(re,'$1"'+lb+'"$2');}
function isIn(c,p){return c.x>=p.x&&c.y>=p.y&&c.x+c.w<=p.x+p.w&&c.y+c.h<=p.y+p.h;}
function fCh(gr){return{cb:parsed.blocks.filter(function(b){return isIn(b,gr)}),cg:parsed.groups.filter(function(x){return x.id!==gr.id&&isIn(x,gr)})};}

function gSide(a,b,g){var gB=b.y-(a.y+a.h),gT=a.y-(b.y+b.h),gR=b.x-(a.x+a.w),gL=a.x-(b.x+b.w),vB=Math.max(gB,gT),hB=Math.max(gR,gL);if(vB>=hB)return gB>=gT?{fs:'bottom',ts:'top'}:{fs:'top',ts:'bottom'};return gR>=gL?{fs:'right',ts:'left'}:{fs:'left',ts:'right'};}
function pPos(b,side,idx,total,g){var bx=b.x*g,by=b.y*g,bw=b.w*g,bh=b.h*g,pad=0.2,t=total===1?0.5:pad+(1-2*pad)*idx/(total-1);if(side==='top')return{x:bx+bw*t,y:by};if(side==='bottom')return{x:bx+bw*t,y:by+bh};if(side==='left')return{x:bx,y:by+bh*t};return{x:bx+bw,y:by+bh*t};}
function cPorts(conns,bm,g){var sides=conns.map(function(c){var a=bm[c.from],b=bm[c.to];return a&&b?gSide(a,b,g):null;});var sm={};conns.forEach(function(c,i){if(!sides[i])return;var a=bm[c.from],b=bm[c.to],fs=sides[i].fs,ts=sides[i].ts;if(!sm[c.from])sm[c.from]={};if(!sm[c.from][fs])sm[c.from][fs]=[];sm[c.from][fs].push({ci:i,ox:b.x+b.w/2,oy:b.y+b.h/2});if(!sm[c.to])sm[c.to]={};if(!sm[c.to][ts])sm[c.to][ts]=[];sm[c.to][ts].push({ci:i,ox:a.x+a.w/2,oy:a.y+a.h/2});});for(var bid in sm)for(var sd in sm[bid]){var list=sm[bid][sd];list.sort(function(a,b){return(sd==='left'||sd==='right')?(a.oy-b.oy):(a.ox-b.ox)});}return conns.map(function(c,i){if(!sides[i])return null;var a=bm[c.from],b=bm[c.to],fl=sm[c.from][sides[i].fs],tl=sm[c.to][sides[i].ts];return{fp:pPos(a,sides[i].fs,fl.findIndex(function(p){return p.ci===i}),fl.length,g),tp:pPos(b,sides[i].ts,tl.findIndex(function(p){return p.ci===i}),tl.length,g),fs:sides[i].fs,ts:sides[i].ts};});}
function eP(p,side,d){if(side==='top')return{x:p.x,y:p.y-d};if(side==='bottom')return{x:p.x,y:p.y+d};if(side==='left')return{x:p.x-d,y:p.y};return{x:p.x+d,y:p.y};}
function bP(f,t,fs,ts){var dx=t.x-f.x,dy=t.y-f.y,dist=Math.sqrt(dx*dx+dy*dy),cpd=Math.max(30,dist*0.4);var c1=eP(f,fs,cpd),c2=eP(t,ts,cpd);return"M"+f.x+","+f.y+" C"+c1.x+","+c1.y+" "+c2.x+","+c2.y+" "+t.x+","+t.y;}

function getHlIds(){if(!parsed)return null;var ids=new Set();parsed.connections.forEach(function(c){ids.add(c.from);ids.add(c.to);});return ids;}
function getHlGroups(ids){var gs=new Set();parsed.blocks.forEach(function(b){if(ids.has(b.id)){parsed.groups.forEach(function(gr){if(isIn(b,gr))gs.add(gr.id);});}});return gs;}
function isHlConn(c,ids){return ids.has(c.from)&&ids.has(c.to);}
function toggleHL(){highlight=!highlight;var btn=document.getElementById('hl-btn');if(btn)btn.classList.toggle('hl-act',highlight);render();}

function render(){
  if(!parsed)return;var cv=parsed.canvas,bl=parsed.blocks,gr=parsed.groups,cn=parsed.connections,bm=parsed.blockMap,g=cv.grid;
  var hlIds=highlight?getHlIds():null;var hlGr=hlIds?getHlGroups(hlIds):null;var dim=0.15;
  var s='<svg width="'+(cv.width*zm)+'" height="'+(cv.height*zm)+'" viewBox="0 0 '+cv.width+' '+cv.height+'" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif">';
  s+='<defs><pattern id="gd" width="'+g+'" height="'+g+'" patternUnits="userSpaceOnUse"><circle cx="'+(g/2)+'" cy="'+(g/2)+'" r="0.5" fill="#CBD5E1" opacity="0.5"/></pattern>';
  cn.forEach(function(c,i){s+='<marker id="a'+i+'" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,3.5 L0,7 Z" fill="'+c.color+'"/></marker>';});
  s+='</defs><rect width="100%" height="100%" fill="url(#gd)"/>';

  gr.forEach(function(x){var sl=isSel(x.id);var gDim=hlIds&&!hlGr.has(x.id);s+='<g data-type="group" data-id="'+x.id+'" style="cursor:grab"'+(gDim?' opacity="'+dim+'"':'')+'><rect x="'+(x.x*g)+'" y="'+(x.y*g)+'" width="'+(x.w*g)+'" height="'+(x.h*g)+'" fill="'+x.color+'" stroke="'+(sl?'#6366F1':x.borderColor)+'" stroke-width="'+(sl?3:1.5)+'" rx="8" opacity="0.85"'+(sl?' stroke-dasharray="8,4"':'')+'/><text x="'+(x.x*g+8)+'" y="'+(x.y*g+14)+'" font-size="11" font-weight="600" fill="'+x.borderColor+'" opacity="0.9" style="pointer-events:none">'+esc(x.label)+'</text></g>';});

  var ports=cPorts(cn,bm,g);cn.forEach(function(c,i){var p=ports[i];if(!p)return;var d=c.style==="dashed"?' stroke-dasharray="6,3"':'';var cDim=hlIds&&!isHlConn(c,hlIds);s+='<g'+(cDim?' opacity="'+dim+'"':'')+'><path d="'+bP(p.fp,p.tp,p.fs,p.ts)+'" fill="none" stroke="'+c.color+'" stroke-width="1.5"'+d+' marker-end="url(#a'+i+')"'+(c.bidir?' marker-start="url(#a'+i+')"':'')+'/>';if(c.label)s+='<text x="'+((p.fp.x+p.tp.x)/2)+'" y="'+((p.fp.y+p.tp.y)/2-5)+'" font-size="10" fill="'+c.color+'" text-anchor="middle" font-weight="500">'+esc(c.label)+'</text>';s+='</g>';});

  bl.forEach(function(b){var sl=isSel(b.id),sw=sl?2.5:b.style==="bold"?2.5:1,ds=b.style==="dashed"?' stroke-dasharray="6,3"':'',ft=sl?"drop-shadow(0 4px 12px rgba(99,102,241,0.5))":"drop-shadow(0 1px 2px rgba(0,0,0,0.12))";var bDim=hlIds&&!hlIds.has(b.id);
    s+='<g data-type="block" data-id="'+b.id+'" style="cursor:grab"'+(bDim?' opacity="'+dim+'"':'')+'><rect x="'+(b.x*g)+'" y="'+(b.y*g)+'" width="'+(b.w*g)+'" height="'+(b.h*g)+'" fill="'+b.color+'" stroke="'+(sl?'#FFFFFF':(b.borderColor||b.color))+'" stroke-width="'+sw+'"'+ds+' rx="'+b.round+'" style="filter:'+ft+'"/>';
    // Split label on literal backslash-n
    b.label.split("\\\\n").forEach(function(ln,li,ar){var ty=b.y*g+b.h*g/2+(li-(ar.length-1)/2)*14;s+='<text x="'+(b.x*g+b.w*g/2)+'" y="'+ty+'" font-size="11" font-weight="600" fill="'+b.textColor+'" text-anchor="middle" dominant-baseline="central" style="pointer-events:none">'+esc(ln)+'</text>';});
    s+='</g>';});

  // Resize handles
  sel.forEach(function(si){var it=getIt(si);if(!it)return;var x=it.x*g,y=it.y*g,w=it.w*g,h=it.h*g,hs=10,hit=20;
    [{cx:x,cy:y,cur:'nw-resize',e:'nw'},{cx:x+w,cy:y,cur:'ne-resize',e:'ne'},{cx:x,cy:y+h,cur:'sw-resize',e:'sw'},{cx:x+w,cy:y+h,cur:'se-resize',e:'se'},{cx:x+w/2,cy:y,cur:'n-resize',e:'n'},{cx:x+w/2,cy:y+h,cur:'s-resize',e:'s'},{cx:x,cy:y+h/2,cur:'w-resize',e:'w'},{cx:x+w,cy:y+h/2,cur:'e-resize',e:'e'}].forEach(function(hd){
      s+='<rect data-resize="'+hd.e+'" data-rid="'+si.id+'" data-rtype="'+si.type+'" x="'+(hd.cx-hit/2)+'" y="'+(hd.cy-hit/2)+'" width="'+hit+'" height="'+hit+'" fill="transparent" style="cursor:'+hd.cur+'"/>';
      s+='<rect x="'+(hd.cx-hs/2)+'" y="'+(hd.cy-hs/2)+'" width="'+hs+'" height="'+hs+'" fill="#6366F1" stroke="#fff" stroke-width="1.5" rx="2" style="pointer-events:none"/>';
    });});
  s+='</svg>';
  document.getElementById('wrap').innerHTML=s;
  setupInt();
}

// Interactions
function svgSc(){var svg=document.querySelector('#wrap svg');if(!svg)return{sx:1,sy:1};var r=svg.getBoundingClientRect();return{sx:parsed.canvas.width/r.width,sy:parsed.canvas.height/r.height};}

function setupInt(){
  var g=parsed.canvas.grid;
  // Resize
  document.querySelectorAll('[data-resize]').forEach(function(el){el.addEventListener('mousedown',function(e){
    e.preventDefault();e.stopPropagation();var edge=el.dataset.resize,id=el.dataset.rid,tp=el.dataset.rtype;
    var it=tp==="block"?parsed.blockMap[id]:parsed.groupMap[id];if(!it)return;pushH();
    var sc=svgSc(),mx0=e.clientX,my0=e.clientY,ox=it.x,oy=it.y,ow=it.w,oh=it.h;
    function onM(ev){var dx=Math.round((ev.clientX-mx0)*sc.sx/g),dy=Math.round((ev.clientY-my0)*sc.sy/g),nx=ox,ny=oy,nw=ow,nh=oh;
      if(edge.indexOf('e')>=0)nw=Math.max(1,ow+dx);if(edge.indexOf('w')>=0){nw=Math.max(1,ow-dx);nx=ox+ow-nw;}
      if(edge.indexOf('s')>=0)nh=Math.max(1,oh+dy);if(edge.indexOf('n')>=0){nh=Math.max(1,oh-dy);ny=oy+oh-nh;}
      upP(tp,id,Math.max(0,nx),Math.max(0,ny));upS(tp,id,nw,nh);parsed=parseDSL(dsl);render();}
    function onU(){window.removeEventListener('mousemove',onM);window.removeEventListener('mouseup',onU);go();notify();}
    window.addEventListener('mousemove',onM);window.addEventListener('mouseup',onU);});});

  // Drag
  document.querySelectorAll('#wrap g[data-id]').forEach(function(el){el.addEventListener('mousedown',function(e){
    e.preventDefault();e.stopPropagation();var tp=el.dataset.type,id=el.dataset.id;
    if(e.shiftKey){if(isSel(id))sel=sel.filter(function(s){return s.id!==id});else sel.push({type:tp,id:id});}
    else{if(!isSel(id))sel=[{type:tp,id:id}];}
    render();props();
    var sc=svgSc(),mx0=e.clientX,my0=e.clientY,ds=new Map();
    sel.forEach(function(si){var it=getIt(si);if(!it)return;ds.set(si.id,{type:si.type,id:si.id,sx:it.x,sy:it.y});
      if(si.type==="group"){var ch=fCh(it);ch.cb.forEach(function(b){if(!ds.has(b.id))ds.set(b.id,{type:"block",id:b.id,sx:b.x,sy:b.y});});ch.cg.forEach(function(x){if(!ds.has(x.id))ds.set(x.id,{type:"group",id:x.id,sx:x.x,sy:x.y});});}});
    var items=Array.from(ds.values()),moved=false,hp=false;
    function onM(ev){if(!hp){pushH();hp=true;}moved=true;var dx=Math.round((ev.clientX-mx0)*sc.sx/g),dy=Math.round((ev.clientY-my0)*sc.sy/g);items.forEach(function(it){upP(it.type,it.id,Math.max(0,it.sx+dx),Math.max(0,it.sy+dy));});parsed=parseDSL(dsl);render();}
    function onU(){window.removeEventListener('mousemove',onM);window.removeEventListener('mouseup',onU);if(!moved)return;go();notify();}
    window.addEventListener('mousemove',onM);window.addEventListener('mouseup',onU);});});

  // Deselect
  var svg=document.querySelector('#wrap svg');
  if(svg)svg.addEventListener('mousedown',function(e){if(e.target.tagName==='svg'||(e.target.tagName==='rect'&&!e.target.closest('g[data-id]')&&!e.target.dataset.resize)){sel=[];render();props();}});
}

// Property Panel
function props(){
  var el=document.getElementById('propPanel');
  if(!sel.length){
    el.innerHTML='<div class="pl" style="margin-top:0">TOOLS</div>'+
      '<button class="pbtn" onclick="addBlock()">+ Block</button>'+
      '<button class="pbtn" onclick="addGroup()">+ Group</button>'+
      '<div class="pl">CONNECT</div>'+
      '<div class="pr"><input class="pi" id="cf" placeholder="from" style="flex:1"><span style="color:#888;line-height:24px">&rarr;</span><input class="pi" id="ct" placeholder="to" style="flex:1"></div>'+
      '<button class="pbtn" onclick="addConn()">Add</button>'+
      '<div style="margin-top:12px;font-size:9px;color:#888;line-height:1.4">Click: select<br>Shift+Click: multi<br>Drag: move<br>Handles: resize<br>Ctrl+Z/Y: undo/redo<br>Del: delete</div>';
    return;
  }
  if(sel.length>1){
    var mh='<div class="pl" style="margin-top:0">'+sel.length+' SELECTED</div>'+
      stepper2("Position","bNudge('x',-1)","bNudge('x',1)","bNudge('y',-1)","bNudge('y',1)")+
      stepper2("Size","bNudgeSz('w',-1)","bNudgeSz('w',1)","bNudgeSz('h',-1)","bNudgeSz('h',1)")+
      '<div class="pl">Color</div><div class="cg">'+COLORS.map(function(c){return'<div class="cd" style="background:'+c+'" onclick="bProp(\\'color\\',\\''+c+'\\')"></div>'}).join('')+'</div>';
    if(sel.length===2){
      var sa=sel[0].id,sb=sel[1].id,cns=findCB(sa,sb);
      var CC=["#64748B","#6366F1","#8B5CF6","#EC4899","#EF4444","#F59E0B","#22C55E","#3B82F6","#06B6D4","#DC2626","#1E293B","#0F172A"];
      mh+='<div class="pl">Connection</div>';
      if(cns.length===0){
        mh+='<div style="display:flex;gap:3px"><button class="pbtn" style="flex:1;background:#6366F1;color:#fff;border-color:#6366F1" onclick="connTwo(\\''+sa+'\\',\\''+sb+'\\')">'+esc(sa)+' &rarr; '+esc(sb)+'</button><button class="pbtn" style="flex:1;background:#6366F1;color:#fff;border-color:#6366F1" onclick="connTwo(\\''+sb+'\\',\\''+sa+'\\')">'+esc(sb)+' &rarr; '+esc(sa)+'</button></div>';
        mh+='<div class="pl" style="font-size:9px;margin-top:4px">Color + Connect</div><div class="cg">'+CC.map(function(c){return'<div class="cd" style="background:'+c+'" onclick="connTwo(\\''+sa+'\\',\\''+sb+'\\',\\''+c+'\\')"></div>'}).join('')+'</div>';
      }else{
        var cn=cns[0],fa=cn.from,ta=cn.to;
        mh+='<div style="padding:4px 6px;background:var(--bg);border-radius:4px;margin-bottom:6px;font-size:11px;color:#ccc;text-align:center">'+esc(fa)+(cn.bidir?' &#x2194; ':' &rarr; ')+esc(ta)+'</div>';
        mh+='<div style="display:flex;gap:3px"><button class="pbtn" style="flex:1" onclick="flipC(\\''+fa+'\\',\\''+ta+'\\')">&#x21C4; Flip</button><button class="pbtn" style="flex:1" onclick="togBi(\\''+fa+'\\',\\''+ta+'\\')">'+(cn.bidir?'&rarr; One-way':'&#x2194; Bidir')+'</button></div>';
        mh+='<div class="pl" style="font-size:9px;margin-top:4px">Line Color</div><div class="cg">'+CC.map(function(c){return'<div class="cd'+(cn.color===c?' act':'')+'" style="background:'+c+'" onclick="setCC(\\''+fa+'\\',\\''+ta+'\\',\\''+c+'\\')"></div>'}).join('')+'</div>';
        mh+='<button class="pbtn" style="border-color:#c44;color:#faa;margin-top:4px;width:100%" onclick="rmConn(\\''+fa+'\\',\\''+ta+'\\')">Remove Connection</button>';
      }
    }
    mh+='<button class="pbtn" style="border-color:#c44;color:#faa;margin-top:12px" onclick="bDel()">Delete All</button>';
    el.innerHTML=mh;
    return;
  }
  var si=sel[0],it=getIt(si);if(!it){sel=[];props();return;}
  var isB=it.type==="block";
  var h='<div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:11px;font-weight:700;color:'+(isB?'#A5B4FC':'#C4B5FD')+'">'+it.id+'</span><span onclick="sel=[];render();props()" style="cursor:pointer;color:#888;font-size:14px">&times;</span></div>';
  h+='<div class="pl">Label</div><input class="pi" value="'+esc(it.label)+'" oninput="sLb(this.value)">';
  h+=stepperRow("X","sNudge(\\'x\\',-1)","sNudge(\\'x\\',1)",it.x)+stepperRow("Y","sNudge(\\'y\\',-1)","sNudge(\\'y\\',1)",it.y);
  h+=stepperRow("W","sNudgeSz(\\'w\\',-1)","sNudgeSz(\\'w\\',1)",it.w)+stepperRow("H","sNudgeSz(\\'h\\',-1)","sNudgeSz(\\'h\\',1)",it.h);
  h+='<div class="pl">Color</div><div class="cg">'+(isB?COLORS:BG_COLORS).map(function(c){return'<div class="cd'+(it.color===c?' act':'')+'" style="background:'+c+'" onclick="sPr(\\'color\\',\\''+c+'\\')"></div>'}).join('')+'</div>';
  h+='<input class="pi" style="width:80px" value="'+it.color+'" oninput="sPr(\\'color\\',this.value)">';
  if(isB){
    h+='<div class="pl">Text Color</div><div class="cg">'+["#FFFFFF","#000000","#1E293B","#F8FAFC"].map(function(c){return'<div class="cd'+(it.textColor===c?' act':'')+'" style="background:'+c+'" onclick="sPr(\\'text\\',\\''+c+'\\')"></div>'}).join('')+'</div>';
    h+=stepperRow("Round","sNudgeR(-1)","sNudgeR(1)",it.round);
    h+='<div class="pl">Style</div><div style="display:flex;gap:3px">'+["solid","dashed","bold"].map(function(s){return'<button class="sbtn'+(it.style===s?' act':'')+'" onclick="sPr(\\'style\\',\\''+s+'\\')">'+s+'</button>'}).join('')+'</div>';
  }else{
    h+='<div class="pl">Border</div><div class="cg">'+COLORS.map(function(c){return'<div class="cd'+(it.borderColor===c?' act':'')+'" style="background:'+c+'" onclick="sPr(\\'border\\',\\''+c+'\\')"></div>'}).join('')+'</div>';
    h+='<button class="pbtn" style="background:#6366F1;color:#fff;border-color:#6366F1;margin-top:8px" onclick="addBlockInGroup(\\''+it.id+'\\')">+ Block in Group</button>';
  }
  h+='<button class="pbtn" style="border-color:#c44;color:#faa;margin-top:12px" onclick="sDel()">Delete</button>';
  el.innerHTML=h;
}

function stepperRow(label,decF,incF,val){
  return '<div class="pl">'+label+'</div><div class="stepper" style="margin-bottom:4px"><input class="pi" type="number" value="'+val+'" oninput="sField(\\''+label.toLowerCase()+'\\',this.value)"><div class="stcol"><button class="stb up" onclick="'+incF+'">&#x25B2;</button><button class="stb dn" onclick="'+decF+'">&#x25BC;</button></div></div>';
}
function stepper2(label,xd,xi,yd,yi){
  return '<div class="pl">'+label+'</div><div class="pr"><div style="flex:1"><div style="font-size:8px;color:#888">X</div><div class="stepper"><input class="pi" value="" disabled><div class="stcol"><button class="stb up" onclick="'+xi+'">&#x25B2;</button><button class="stb dn" onclick="'+xd+'">&#x25BC;</button></div></div></div><div style="flex:1"><div style="font-size:8px;color:#888">Y</div><div class="stepper"><input class="pi" value="" disabled><div class="stcol"><button class="stb up" onclick="'+yd+'">&#x25B2;</button><button class="stb dn" onclick="'+yi+'">&#x25BC;</button></div></div></div></div>';
}

// Single-item actions
function sPr(p,v){if(!sel.length)return;pushH();upPr(sel[0].type,sel[0].id,p,v);go();notify();}
function sLb(v){if(!sel.length)return;pushH();upLb(sel[0].type,sel[0].id,v);parsed=parseDSL(dsl);render();
  document.getElementById('err').innerHTML=parsed.errors.length?'<div class="error">'+parsed.errors.map(function(e){return 'L'+e.line+': '+esc(e.msg)}).join('<br>')+'</div>':'';
  document.getElementById('stats').textContent='Blocks:'+parsed.blocks.length+' Groups:'+parsed.groups.length+' Conn:'+parsed.connections.length+' Sel:'+sel.length;
  document.getElementById('si').textContent=sel.length?sel.length+' selected':'Click to select';notify();}
function sField(f,v){if(!sel.length)return;var n=parseInt(v);if(isNaN(n))return;pushH();var it=getIt(sel[0]);if(!it)return;
  if(f==='x'||f==='y')upP(sel[0].type,sel[0].id,f==='x'?Math.max(0,n):it.x,f==='y'?Math.max(0,n):it.y);
  else if(f==='w'||f==='h')upS(sel[0].type,sel[0].id,f==='w'?Math.max(1,n):it.w,f==='h'?Math.max(1,n):it.h);
  else if(f==='round')upPr(sel[0].type,sel[0].id,'round',Math.max(0,n));
  go();notify();}
function sNudge(ax,d){if(!sel.length)return;pushH();var s=sel[0],it=getIt(s);if(!it)return;
  if(s.type==='group'){var ch=fCh(it);ch.cb.forEach(function(b){upP('block',b.id,b.x+(ax==='x'?d:0),b.y+(ax==='y'?d:0))});ch.cg.forEach(function(g){upP('group',g.id,g.x+(ax==='x'?d:0),g.y+(ax==='y'?d:0))});}
  upP(s.type,s.id,Math.max(0,it.x+(ax==='x'?d:0)),Math.max(0,it.y+(ax==='y'?d:0)));go();notify();}
function sNudgeSz(ax,d){if(!sel.length)return;pushH();var it=getIt(sel[0]);if(!it)return;upS(sel[0].type,sel[0].id,ax==='w'?Math.max(1,it.w+d):it.w,ax==='h'?Math.max(1,it.h+d):it.h);go();notify();}
function sNudgeR(d){if(!sel.length)return;var it=parsed.blockMap[sel[0].id];if(!it)return;pushH();upPr(sel[0].type,sel[0].id,'round',Math.max(0,it.round+d));go();notify();}
function sDel(){if(!sel.length)return;pushH();delItems(sel);sel=[];go();notify();}

// Batch actions
function bNudge(ax,d){pushH();sel.forEach(function(si){var it=getIt(si);if(!it)return;if(si.type==='group'){var ch=fCh(it);ch.cb.forEach(function(b){upP('block',b.id,Math.max(0,b.x+(ax==='x'?d:0)),Math.max(0,b.y+(ax==='y'?d:0)))});ch.cg.forEach(function(g){upP('group',g.id,Math.max(0,g.x+(ax==='x'?d:0)),Math.max(0,g.y+(ax==='y'?d:0)))});}upP(si.type,si.id,Math.max(0,it.x+(ax==='x'?d:0)),Math.max(0,it.y+(ax==='y'?d:0)));});go();notify();}
function bNudgeSz(ax,d){pushH();sel.forEach(function(si){var it=getIt(si);if(!it)return;upS(si.type,si.id,ax==='w'?Math.max(1,it.w+d):it.w,ax==='h'?Math.max(1,it.h+d):it.h);});go();notify();}
function bProp(p,v){pushH();sel.forEach(function(si){upPr(si.type,si.id,p,v)});go();notify();}
function bDel(){pushH();delItems(sel);sel=[];go();notify();}

function delItems(items){items.forEach(function(si){var lines=dsl.split("\\n"),re=new RegExp("^\\\\s*"+si.type+"\\\\s+"+si.id+"\\\\s+"),c1=new RegExp("(^|\\\\s)"+si.id+"(\\\\s+(-->|->)\\\\s+|$)"),c2=new RegExp("\\\\s+(-->|->)\\\\s+"+si.id+"(\\\\s|$)");dsl=lines.filter(function(l){return !re.test(l)&&!c1.test(l)&&!c2.test(l)}).join("\\n");});}

// Copy / Cut / Paste
var clipboard=null;
function getLine(tp,id){var lines=dsl.split("\\n"),re=new RegExp("^\\\\s*"+tp+"\\\\s+"+id+"\\\\s+");for(var i=0;i<lines.length;i++){if(re.test(lines[i]))return lines[i].trim();}return null;}
function copySel(){if(!sel.length)return;clipboard=sel.map(function(si){var ln=getLine(si.type,si.id);return ln?{type:si.type,id:si.id,line:ln}:null;}).filter(Boolean);}
function cutSel(){if(!sel.length)return;copySel();pushH();delItems(sel);sel=[];go();notify();}
function pasteSel(){if(!clipboard||!clipboard.length)return;pushH();var ns=[];clipboard.forEach(function(ci){var nid="__new_"+(addC++);var ln=ci.line.replace(new RegExp("^("+ci.type+"\\\\s+)"+ci.id),"$1"+nid);ln=ln.replace(/at\\s+([\\d.]+),([\\d.]+)/,function(m,x,y){return"at "+(+x+2)+","+(+y+2)});dsl=dsl.trimEnd()+"\\n"+ln+"\\n";ns.push({type:ci.type,id:nid});});sel=ns;go();notify();}

// Connection management (two-select)
function findCB(a,b){return parsed.connections.filter(function(c){return(c.from===a&&c.to===b)||(c.from===b&&c.to===a)});}
function connTwo(a,b,col){pushH();var extra=col?" color="+col:"";dsl=dsl.trimEnd()+"\\n"+a+" -> "+b+extra+"\\n";go();notify();}
function rmConn(a,b){pushH();var lines=dsl.split("\\n");dsl=lines.filter(function(l){var m=l.trim().match(/^(\\S+)\\s+(-->|->)\\s+(\\S+)/);if(!m)return true;return!((m[1]===a&&m[3]===b)||(m[1]===b&&m[3]===a));}).join("\\n");go();notify();}
function flipC(a,b){pushH();var lines=dsl.split("\\n");for(var i=0;i<lines.length;i++){var m=lines[i].trim().match(/^(\\S+)(\\s+)(-->|->)(\\s+)(\\S+)(.*)/);if(!m)continue;if((m[1]===a&&m[5]===b)||(m[1]===b&&m[5]===a)){lines[i]=lines[i].replace(/^(\\s*)(\\S+)(\\s+)(-->|->)(\\s+)(\\S+)/,function(_,sp,f,s1,ar,s2,t){return sp+t+s1+ar+s2+f;});break;}}dsl=lines.join("\\n");go();notify();}
function togBi(a,b){pushH();var lines=dsl.split("\\n");for(var i=0;i<lines.length;i++){var m=lines[i].trim().match(/^(\\S+)\\s+(-->|->)\\s+(\\S+)/);if(!m)continue;if((m[1]===a&&m[3]===b)||(m[1]===b&&m[3]===a)){lines[i]=m[2]==='-->'?lines[i].replace('-->','->'):lines[i].replace('->','-->');break;}}dsl=lines.join("\\n");go();notify();}
function setCC(a,b,col){pushH();var lines=dsl.split("\\n");for(var i=0;i<lines.length;i++){var m=lines[i].trim().match(/^(\\S+)\\s+(-->|->)\\s+(\\S+)/);if(!m)continue;if((m[1]===a&&m[3]===b)||(m[1]===b&&m[3]===a)){lines[i]=lines[i].match(/color=\\S+/)?lines[i].replace(/color=\\S+/,"color="+col):lines[i].trimEnd()+" color="+col;break;}}dsl=lines.join("\\n");go();notify();}

// Add
function addBlock(){pushH();var id="__new_"+(addC++);dsl=dsl.trimEnd()+"\\nblock "+id+' "New Block" at 5,5 size 8x3 color=#3B82F6 text=#FFFFFF round=4\\n';sel=[{type:"block",id:id}];go();notify();}
function addBlockInGroup(gid){var gr=parsed.groupMap[gid];if(!gr)return;pushH();var id="__new_"+(addC++);var ch=fCh(gr).cb;var bw=8,bh=3,pad=1,labelH=2;var px=gr.x+pad,py=gr.y+labelH;if(ch.length){var sorted=ch.slice().sort(function(a,b){return a.y===b.y?a.x-b.x:a.y-b.y});var last=sorted[sorted.length-1];px=last.x+last.w+pad;py=last.y;if(px+bw>gr.x+gr.w-pad){px=gr.x+pad;py=last.y+last.h+pad;}if(py+bh>gr.y+gr.h){upS('group',gid,gr.w,py+bh-gr.y+pad);parsed=parseDSL(dsl);}}dsl=dsl.trimEnd()+"\\nblock "+id+' "New Block" at '+px+','+py+' size '+bw+'x'+bh+' color=#3B82F6 text=#FFFFFF round=4\\n';sel=[{type:"block",id:id}];go();notify();}
function addGroup(){pushH();var id="__new_"+(addC++);dsl=dsl.trimEnd()+"\\ngroup "+id+' "New Group" at 5,5 size 20x8 color=#F1F5F9 border=#94A3B8\\n';sel=[{type:"group",id:id}];go();notify();}
function addConn(){var f=document.getElementById('cf'),t=document.getElementById('ct');if(f&&t&&f.value&&t.value){pushH();dsl=dsl.trimEnd()+"\\n"+f.value+" -> "+t.value+"\\n";go();notify();}}
function lToId(lb){return lb.replace(/\\\\n/g,' ').replace(/[^a-zA-Z0-9\\s]/g,'').trim().replace(/\\s+/g,'_').toLowerCase()||'block';}
function fixN(){if(!parsed)return;var all=parsed.blocks.concat(parsed.groups);var tgts=all.filter(function(x){return x.id.indexOf('__new_')===0;});if(!tgts.length)return;pushH();var used={};all.forEach(function(x){if(x.id.indexOf('__new_')!==0)used[x.id]=1;});var rns=[];tgts.forEach(function(t){var base=lToId(t.label);if(used[base]){var n=2;while(used[base+'_'+n])n++;base=base+'_'+n;}used[base]=1;rns.push({o:t.id,n:base});});rns.forEach(function(r){dsl=dsl.replace(new RegExp('\\\\b'+r.o.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&')+'\\\\b','g'),r.n);});sel=sel.map(function(s){var r=rns.filter(function(r){return r.o===s.id;})[0];return r?{type:s.type,id:r.n}:s;});go();notify();}

// Refresh
function go(){parsed=parseDSL(dsl);render();props();
  document.getElementById('err').innerHTML=parsed.errors.length?'<div class="error">'+parsed.errors.map(function(e){return 'L'+e.line+': '+esc(e.msg)}).join('<br>')+'</div>':'';
  document.getElementById('stats').textContent='Blocks:'+parsed.blocks.length+' Groups:'+parsed.groups.length+' Conn:'+parsed.connections.length+' Sel:'+sel.length;
  document.getElementById('si').textContent=sel.length?sel.length+' selected':'Click to select';}

// Export
function exportSVG(){var svg=document.querySelector('#wrap svg');if(!svg)return;var clone=svg.cloneNode(true);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');vscodeApi.postMessage({type:'exportSVG',data:clone.outerHTML});}
function exportPNG(){var svg=document.querySelector('#wrap svg');if(!svg)return;var d=new XMLSerializer().serializeToString(svg),img=new Image();img.onload=function(){var c=document.createElement('canvas');c.width=parsed.canvas.width*zm*2;c.height=parsed.canvas.height*zm*2;var ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);vscodeApi.postMessage({type:'exportPNG',data:c.toDataURL('image/png')});};img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(d)));}
function sz(d){zm=Math.max(0.25,Math.min(3,zm+d*0.25));document.getElementById('zl').textContent=Math.round(zm*100)+'%';render();}

// Keyboard
document.addEventListener('keydown',function(e){
  var inInput=document.activeElement&&(document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA');
  if(inInput)return;
  if(e.key==='h'||e.key==='H'){e.preventDefault();toggleHL();return;}
  if(sel.length&&(e.key==='ArrowUp'||e.key==='ArrowDown'||e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();var ax=e.key==='ArrowLeft'||e.key==='ArrowRight'?'x':'y';var d=e.key==='ArrowRight'||e.key==='ArrowDown'?1:-1;if(sel.length>1)bNudge(ax,d);else sNudge(ax,d);return;}
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
  if(msg.type==='selectAll'){sel=parsed.blocks.map(function(b){return{type:'block',id:b.id}}).concat(parsed.groups.map(function(g){return{type:'group',id:g.id}}));render();props();return;}
  if(msg.type==='copy'){copySel();return;}
  if(msg.type==='cut'){cutSel();return;}
  if(msg.type==='paste'){pasteSel();return;}
});

parsed=parseDSL(dsl);go();
</script></body></html>`;
}

function deactivate() {}
module.exports = { activate, deactivate };
