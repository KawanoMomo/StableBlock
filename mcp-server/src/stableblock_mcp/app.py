"""FastMCP application — registers all StableBlock tools."""

from __future__ import annotations

from mcp.server.fastmcp import FastMCP

from stableblock_mcp.tools.diagram import sb_new, sb_open, sb_save, sb_show
from stableblock_mcp.tools.elements import (
    sb_add_block,
    sb_add_group,
    sb_connect,
    sb_modify,
    sb_remove,
)
from stableblock_mcp.tools.export import sb_export_svg
from stableblock_mcp.tools.smart import sb_auto_layout, sb_from_template

INSTRUCTIONS = """\
StableBlock MCP Server — deterministic block diagram tool.

## Workflow
1. Start with `sb_new` (empty) or `sb_from_template` (from template)
2. Add/modify elements with `sb_add_group`, `sb_add_block`, `sb_connect`, `sb_modify`, `sb_remove`
3. Check current state with `sb_show`
4. Save with `sb_save` (DSL .sb file) or `sb_export_svg` (SVG image)

## Tips
- Use `sb_from_template("layered", ...)` for architecture diagrams
- Use `sb_from_template("pipeline", ...)` for flow diagrams
- All positioning is automatic — you only need to specify structure
- `sb_auto_layout` recalculates positions if the diagram looks off
- Color themes: "blue", "amber", "green", "gray", "red", "purple"
"""

mcp = FastMCP(
    "StableBlock",
    instructions=INSTRUCTIONS,
)

# Register all tools
mcp.tool()(sb_new)
mcp.tool()(sb_open)
mcp.tool()(sb_save)
mcp.tool()(sb_show)
mcp.tool()(sb_add_block)
mcp.tool()(sb_add_group)
mcp.tool()(sb_connect)
mcp.tool()(sb_remove)
mcp.tool()(sb_modify)
mcp.tool()(sb_from_template)
mcp.tool()(sb_auto_layout)
mcp.tool()(sb_export_svg)
