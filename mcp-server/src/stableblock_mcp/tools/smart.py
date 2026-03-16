"""Smart tools: sb_from_template, sb_auto_layout, sb_validate_layout."""

from __future__ import annotations

from stableblock_mcp import state
from stableblock_mcp.core.layout import auto_layout
from stableblock_mcp.core.templates import TEMPLATES, apply_template
from stableblock_mcp.core.validate_layout import validate_layout


def sb_from_template(
    template: str,
    data: dict,
) -> dict:
    """Generate a diagram from a template.

    Args:
        template: Template name — "layered", "pipeline", or "grid".
        data: Template-specific data. See examples below.

    Templates:
        layered: {"layers": [{"label": "...", "blocks": ["...", ...], "color_theme"?: "..."}, ...], "connect_adjacent"?: true}
        pipeline: {"stages": ["...", ...], "direction"?: "horizontal"|"vertical", "color_theme"?: "..."}
        grid: {"rows": [["...", ...], ...], "color_theme"?: "..."}

    Returns:
        Structured summary of the generated diagram.
    """
    template = template.strip().strip('"').strip("'")
    diagram = apply_template(template, data)
    state.set_diagram(diagram)
    summary = state.summarize()
    return summary.model_dump()


def sb_auto_layout(direction: str = "top-down") -> dict:
    """Recalculate layout for the entire diagram.

    Repositions all groups and blocks for optimal arrangement.
    Groups are stacked top-to-bottom, blocks within groups are
    evenly distributed horizontally.

    Args:
        direction: Layout direction (currently only "top-down" is supported).

    Returns:
        Structured summary after relayout.
    """
    diagram = state.get()
    state.push_history()
    auto_layout(diagram, direction)
    summary = state.summarize()
    return summary.model_dump()


def sb_validate_layout() -> dict:
    """Check the current diagram for layout problems.

    Detects:
        - Block-block overlaps
        - Group-group overlaps
        - Blocks extending outside their parent group
        - Elements outside the canvas
        - Text labels overflowing block/group boundaries

    Returns:
        {"ok": bool, "issue_count": int, "errors": [...], "warnings": [...]}
        Each issue has: type, ids, message, suggestion.

    Use this AFTER making changes to verify layout quality.
    If issues are found, use sb_modify to fix individual elements,
    or sb_auto_layout to recalculate all positions.
    """
    diagram = state.get()
    issues = validate_layout(diagram)
    errors = [i for i in issues if i["severity"] == "error"]
    warnings = [i for i in issues if i["severity"] == "warning"]
    return {
        "ok": len(errors) == 0,
        "issue_count": len(issues),
        "errors": errors,
        "warnings": warnings,
    }
