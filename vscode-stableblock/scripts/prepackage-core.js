// Copies the core/ runtime assets that vscode-stableblock/src/extension.js
// reads at runtime (readFileSync) into vscode-stableblock/core/, so that
// `vsce package` bundles them into the .vsix. Without this, an installed
// extension (code --install-extension) has no core/ directory next to it
// and every readFileSync call in getWebviewContent() fails silently
// (caught, logged, feature breaks).
//
// Runs automatically before `vsce package` / `vsce publish` via the
// npm "vscode:prepublish" lifecycle hook (see package.json).
"use strict";

const fs = require("fs");
const path = require("path");

const EXT_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(EXT_ROOT, "..");
const DEST_CORE = path.join(EXT_ROOT, "core");

// Keep this list in sync with the readFileSync() calls in src/extension.js
// (search for "REPO_ROOT" there).
const ASSETS = [
  path.join("core", "label", "label-core.mjs"),
  path.join("core", "select", "select-core.mjs"),
  path.join("core", "layout", "layout-core.mjs"),
  path.join("core", "mermaid", "mermaid-core.mjs"),
  path.join("core", "excel", "emitter.js"),
  path.join("core", "excel", "jszip.min.js"),
  path.join("core", "excel", "template-skeleton"),
];

function copyAsset(relPath) {
  const src = path.join(REPO_ROOT, relPath);
  const dest = path.join(EXT_ROOT, relPath);
  if (!fs.existsSync(src)) {
    throw new Error("prepackage-core: missing source asset " + src);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
  console.log("[prepackage-core] copied " + relPath);
}

fs.rmSync(DEST_CORE, { recursive: true, force: true });
for (const asset of ASSETS) {
  copyAsset(asset);
}
console.log("[prepackage-core] done: " + DEST_CORE);
