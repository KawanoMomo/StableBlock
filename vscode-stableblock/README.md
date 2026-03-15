# StableBlock for Visual Studio Code

Deterministic grid-based block diagram tool — syntax highlighting and interactive live preview for `.sb` / `.stableblock` files.

## Features

- **Syntax Highlighting** — keywords, IDs, labels, coordinates, colors, arrows
- **Interactive Live Preview** — `Ctrl+Shift+V` to open; updates as you type
- **Drag & Drop** — move blocks/groups in the preview, DSL auto-updates in the editor
- **Resize Handles** — 8-point handles on selected items, drag to resize
- **Multi-Select** — `Shift+Click` to select multiple items, drag together
- **Group-Linked Move** — dragging a parent group moves all children
- **Undo/Redo** — `Ctrl+Z` / `Ctrl+Y` in preview, syncs back to editor
- **Delete** — `Delete` key removes selected items and related connections
- **Select All** — `Ctrl+A` selects all blocks and groups
- **Export** — SVG / PNG from preview panel

## Quick Start

1. Create a file with `.sb` extension
2. Write your diagram DSL
3. Press `Ctrl+Shift+V` to open interactive preview

```
@canvas width=960 height=400 grid=20

group layer1 "Application" at 1,1 size 30x6 color=#EEF2FF border=#818CF8

block app1 "App A" at 2,3 size 8x3 color=#6366F1 text=#FFFFFF round=6
block app2 "App B" at 12,3 size 8x3 color=#6366F1 text=#FFFFFF round=6

block middleware "Middleware" at 1,8 size 30x2 color=#F59E0B text=#FFFFFF round=4

app1 -> middleware
app2 -> middleware
```

## Bidirectional Sync

The preview and editor stay in sync:
- **Editor → Preview**: Typing in the editor updates the preview in real-time
- **Preview → Editor**: Dragging/resizing in the preview writes back to the editor document

This means your `.sb` file is always the source of truth.

## Installation

```bash
cd vscode-stableblock
npm install
npx vsce package --allow-missing-repository
code --install-extension stableblock-0.4.6.vsix
```

## License

GPL-3.0. See [LICENSE](LICENSE).

Fonts used via Google Fonts CDN: IBM Plex (SIL OFL 1.1), Noto Sans JP (SIL OFL 1.1).
