# StableBlock for Visual Studio Code

Deterministic grid-based block diagram tool — syntax highlighting and interactive live preview for `.sb` / `.stableblock` files.

## Features

### Editor
- **Syntax Highlighting** — keywords, IDs, labels, coordinates, colors, arrows
- **Interactive Live Preview** — `Ctrl+Shift+V` to open; updates as you type
- **Drag & Drop** — move blocks/groups in the preview, DSL auto-updates in the editor
- **Resize Handles** — 8-point handles on selected items, drag to resize
- **Multi-Select** — `Shift+Click` to select multiple items, drag together
- **Multi-Select → Group** — create a group around selected blocks
- **Group-Linked Move** — dragging a parent group moves all children
- **Snap Guides** — yellow alignment lines shown during drag
- **Search/Filter** — toolbar search input dims non-matching elements
- **Connection Management** — connect, delete, flip, toggle bidirectional, change color/width/style
- **Arrow Key Move** — move selected items by 1 grid unit with arrow keys
- **Highlight Mode** — dim unconnected blocks (`H` key or HL button)
- **ID Auto-Fix** — rename `__new_*` placeholder IDs from labels

### Annotation Layer
- **`note` DSL syntax** — annotations rendered on a separate top layer
- **Show/Hide Toggle** — `N` key or Anno button
- **Edit Mode** — locks blocks, only notes are interactive
- **Note → Block connections** — always rendered as dashed lines

### Export
- **SVG / PNG / Transparent PNG** — from toolbar
- **Clipboard Copy** — copy PNG to clipboard
- **Mermaid Export** — convert to flowchart TD format
- **Git Visual Diff** — side-by-side SVG comparison with HEAD

### Keyboard Shortcuts (in preview)
| Key | Action |
|-----|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+A` | Select All (mode-aware) |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Copy / Cut / Paste |
| `Delete` | Delete selected |
| `H` | Toggle highlight mode |
| `N` | Toggle annotation visibility |
| Arrow keys | Move selected by 1 grid unit |

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

note tip "This is an annotation" at 22,3 size 8x2 color=#FEF3C7 text=#92400E
```

## Bidirectional Sync

The preview and editor stay in sync:
- **Editor → Preview**: Typing in the editor updates the preview in real-time
- **Preview → Editor**: Dragging/resizing in the preview writes back to the editor document

Your `.sb` file is always the source of truth.

## Installation

```bash
cd vscode-stableblock
npm install
npx vsce package --allow-missing-repository
code --install-extension stableblock-0.6.0.vsix
```

## License

GPL-3.0. See [LICENSE](LICENSE).

Fonts used via Google Fonts CDN: IBM Plex (SIL OFL 1.1), Noto Sans JP (SIL OFL 1.1).
