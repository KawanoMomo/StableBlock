# Changelog

All notable changes to StableBlock will be documented in this file.

## [0.6.0] - 2026-03-23

### Added
- **Annotation layer**: `note` DSL syntax, separate rendering layer on top of blocks
  - Show/hide toggle (◇ 注釈 / N key)
  - Edit mode toggle (✎ 編集) — locks blocks, only notes interactive
  - Notes dim blocks at 35% opacity for visual clarity
  - Textarea input for multi-line note text
  - Note-to-block connections (always dashed)
- **Snap guides**: yellow alignment lines shown when dragging near other block edges
- **Search/filter**: toolbar search input dims non-matching elements
- **Multi-select → Group**: create a group around selected blocks with one click
- **Connection width**: `width=N` DSL attribute (1, 1.5, 2, 3, 4) with property panel buttons
- **Connection style**: solid/dashed toggle in property panel for connections
- **Image export enhancements**: transparent PNG, clipboard copy
- **Mermaid export**: convert diagram to Mermaid flowchart TD format
- **@include support**: `@include "file.sb"` preprocessor directive (HTML: fetch-based)
- **Git visual diff**: side-by-side SVG diff with HEAD (VSCode command)

## [0.5.2] - 2026-03-18

### Fixed
- VSCode preview not loading due to regex SyntaxError in Fix ID function (#7)

## [0.5.1] - 2026-03-18

### Added
- Connection line color picker when two blocks are selected
- ID auto-fix: new blocks/groups get `__new_N` placeholder IDs, "ID補正" / "Fix ID" button renames them from labels
- Arrow key movement for selected blocks and groups
- Add block inside group from property panel
- Connection management (connect, delete, flip, bidirectional) when two blocks are selected

### Changed
- Connection routing: edge-gap based side selection for more natural arrow faces
- Connection routing: bezier curves with control-point tangents for smooth lines
- Connection routing: port distribution to separate overlapping connections

### Infrastructure
- Centralized version management via `VERSION` file and `bump-version.sh`

## [0.5.0] - 2026-03-17

### Added
- Highlight mode to dim unconnected blocks (H key or toolbar button)
- Property panel enhancements (stepper inputs, color pickers, style selectors)

## [0.4.4] - 2026-03-17

### Fixed
- Copy/cut/paste shortcuts in VSCode webview preview (#1)
- Ctrl+C/X/V handled via webview keydown + clipboard events

## [0.4.3] - 2026-03-17

### Fixed
- VSCode keyboard shortcuts not reaching webview (#1)
- Label input losing focus on every keystroke (#2)
- Empty label accidentally deleting block (#2)

## [0.1.0] - 2026-03-16

### Added
- Initial release
- StableBlock DSL parser and renderer
- Single-file HTML editor with live preview
- VSCode extension with syntax highlighting and preview panel
- SVG and PNG export
- Grid-based deterministic positioning
- Blocks, groups, and connections
