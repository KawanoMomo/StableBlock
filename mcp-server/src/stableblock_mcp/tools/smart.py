"""Smart tools: sb_from_template, sb_auto_layout."""

from __future__ import annotations

from stableblock_mcp import state
from stableblock_mcp.core.layout import auto_layout
from stableblock_mcp.core.templates import TEMPLATES, apply_template


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
    auto_layout(diagram, direction)
    summary = state.summarize()
    return summary.model_dump()
