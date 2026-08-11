"""Template system for generating diagrams from structured data."""

from __future__ import annotations

from stableblock_mcp.core.layout import auto_layout
from stableblock_mcp.models.types import (
    Block,
    CanvasSettings,
    Connection,
    Diagram,
    Group,
)

# Color themes: (group_color, group_border, block_color, block_text)
COLOR_THEMES: dict[str, tuple[str, str, str, str]] = {
    "blue": ("#EEF2FF", "#818CF8", "#6366F1", "#FFFFFF"),
    "amber": ("#FEF3C7", "#F59E0B", "#D97706", "#FFFFFF"),
    "green": ("#DCFCE7", "#22C55E", "#16A34A", "#FFFFFF"),
    "gray": ("#F1F5F9", "#94A3B8", "#64748B", "#FFFFFF"),
    "red": ("#FEE2E2", "#EF4444", "#DC2626", "#FFFFFF"),
    "purple": ("#F5F3FF", "#8B5CF6", "#8B5CF6", "#FFFFFF"),
}

_ROTATION = ["blue", "amber", "green", "gray"]


def _get_theme(name: str | None, index: int = 0) -> tuple[str, str, str, str]:
    if name and name in COLOR_THEMES:
        return COLOR_THEMES[name]
    return COLOR_THEMES[_ROTATION[index % len(_ROTATION)]]


def _make_id(label: str) -> str:
    """Convert a label into a safe DSL id."""
    return label.lower().replace(" ", "_").replace("-", "_")


def template_layered(data: dict) -> Diagram:
    """Generate a layered (vertically stacked groups) diagram.

    data: {
        "layers": [{"label": str, "blocks": [str], "color_theme"?: str}, ...],
        "connect_adjacent"?: bool
    }
    """
    layers = data.get("layers", [])
    connect_adjacent = data.get("connect_adjacent", False)

    diagram = Diagram(canvas=CanvasSettings())
    prev_block_ids: list[str] = []

    for i, layer in enumerate(layers):
        label = layer["label"]
        theme = _get_theme(layer.get("color_theme"), i)
        gid = _make_id(label)

        group = Group(
            id=gid, label=label, x=0, y=0, w=0, h=0,
            color=theme[0], border_color=theme[1],
        )
        diagram.groups.append(group)

        current_block_ids: list[str] = []
        for blabel in layer.get("blocks", []):
            bid = _make_id(blabel)
            block = Block(
                id=bid, label=blabel, x=0, y=0, w=0, h=0,
                color=theme[2], text_color=theme[3],
                group_id=gid,
            )
            diagram.blocks.append(block)
            current_block_ids.append(bid)

        # Connect adjacent layers
        if connect_adjacent and prev_block_ids:
            pairs = min(len(prev_block_ids), len(current_block_ids))
            for j in range(pairs):
                diagram.connections.append(
                    Connection(from_id=prev_block_ids[j], to_id=current_block_ids[j])
                )

        prev_block_ids = current_block_ids

    auto_layout(diagram)
    return diagram


def template_pipeline(data: dict) -> Diagram:
    """Generate a linear pipeline diagram.

    data: {
        "stages": [str, ...],
        "direction"?: "horizontal" | "vertical",
        "color_theme"?: str
    }
    """
    stages = data.get("stages", [])
    direction = data.get("direction", "horizontal")
    theme = _get_theme(data.get("color_theme"), 0)

    diagram = Diagram(canvas=CanvasSettings())
    prev_id: str | None = None

    for i, label in enumerate(stages):
        bid = _make_id(label)
        if direction == "horizontal":
            x = 1 + i * 11
            y = 1
        else:
            x = 1
            y = 1 + i * 5
        block = Block(
            id=bid, label=label, x=x, y=y, w=9, h=3,
            color=theme[2], text_color=theme[3],
        )
        diagram.blocks.append(block)

        if prev_id:
            diagram.connections.append(Connection(from_id=prev_id, to_id=bid))
        prev_id = bid

    # Adjust canvas size
    if direction == "horizontal":
        diagram.canvas.width = max(960, (1 + len(stages) * 11) * diagram.canvas.grid)
    else:
        diagram.canvas.height = max(640, (1 + len(stages) * 5) * diagram.canvas.grid)

    return diagram


def template_grid(data: dict) -> Diagram:
    """Generate a grid-layout diagram.

    data: {
        "rows": [[str, ...], ...],
        "color_theme"?: str
    }
    """
    rows = data.get("rows", [])
    theme = _get_theme(data.get("color_theme"), 0)

    diagram = Diagram(canvas=CanvasSettings())

    for r, row in enumerate(rows):
        for c, label in enumerate(row):
            bid = _make_id(label)
            block = Block(
                id=bid, label=label,
                x=1 + c * 11, y=1 + r * 5,
                w=9, h=3,
                color=theme[2], text_color=theme[3],
            )
            diagram.blocks.append(block)

    # Adjust canvas
    max_cols = max((len(r) for r in rows), default=0)
    diagram.canvas.width = max(960, (1 + max_cols * 11) * diagram.canvas.grid)
    diagram.canvas.height = max(640, (1 + len(rows) * 5) * diagram.canvas.grid)

    return diagram


TEMPLATES = {
    "layered": template_layered,
    "pipeline": template_pipeline,
    "grid": template_grid,
}


def apply_template(template_name: str, data: dict) -> Diagram:
    """Apply a named template and return the resulting diagram."""
    fn = TEMPLATES.get(template_name)
    if fn is None:
        available = ", ".join(TEMPLATES.keys())
        raise ValueError(f"Unknown template '{template_name}'. Available: {available}")
    return fn(data)
