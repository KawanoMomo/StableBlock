"""Diagram management tools: sb_new, sb_open, sb_save, sb_show, sb_undo, sb_resize_canvas."""

from __future__ import annotations

from pathlib import Path

from stableblock_mcp import state
from stableblock_mcp.core.generator import generate_dsl
from stableblock_mcp.core.parser import parse_dsl
from stableblock_mcp.models.types import CanvasSettings, Diagram


def sb_new(
    width: int = 960,
    height: int = 640,
    grid: int = 20,
) -> str:
    """Create a new empty diagram.

    Args:
        width: Canvas width in pixels (default 960)
        height: Canvas height in pixels (default 640)
        grid: Grid size in pixels (default 20)

    Returns:
        Confirmation message with canvas dimensions.
    """
    diagram = Diagram(canvas=CanvasSettings(width=width, height=height, grid=grid))
    state.set_diagram(diagram)
    return f"Created new diagram ({width}x{height}, grid={grid})"


def sb_open(file_path: str) -> str:
    """Open a .sb file and load it as the current diagram.

    Args:
        file_path: Path to the .sb file to open.

    Returns:
        Summary of the loaded diagram.
    """
    p = Path(file_path)
    if not p.exists():
        return f"Error: File not found: {file_path}"

    text = p.read_text(encoding="utf-8")
    diagram = parse_dsl(text)
    state.set_diagram(diagram)
    summary = state.summarize()
    return (
        f"Opened {file_path}: "
        f"{summary.block_count} blocks, {summary.group_count} groups, "
        f"{summary.connection_count} connections"
    )


def sb_save(file_path: str) -> str:
    """Save the current diagram as a .sb file.

    Args:
        file_path: Path where the .sb file will be saved.

    Returns:
        Confirmation message.
    """
    diagram = state.get()
    dsl_text = generate_dsl(diagram)
    p = Path(file_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(dsl_text, encoding="utf-8")
    return f"Saved to {file_path} ({len(dsl_text)} bytes)"


def sb_show(detail: bool = False) -> dict:
    """Get the current diagram state as a structured summary.

    Args:
        detail: If True, include positions, sizes, and colors for all elements.
                Use this when you need to check or adjust specific element properties.
                Default False returns a compact overview with just IDs and structure.

    Returns:
        Structured summary of the diagram. With detail=True, includes
        x, y, w, h, color for every block and group.
    """
    if detail:
        return state.summarize_detail().model_dump()
    return state.summarize().model_dump()


def sb_undo() -> str:
    """Undo the last diagram change.

    Restores the diagram to the state before the most recent operation.
    Up to 30 levels of undo are supported.

    Returns:
        Confirmation or error message.
    """
    if state.undo():
        summary = state.summarize()
        return (
            f"Undone. Current state: "
            f"{summary.block_count} blocks, {summary.group_count} groups, "
            f"{summary.connection_count} connections"
        )
    return "Nothing to undo"


def sb_resize_canvas(width: int | None = None, height: int | None = None) -> str:
    """Resize the diagram canvas.

    Args:
        width: New canvas width in pixels. If omitted, keeps current width.
        height: New canvas height in pixels. If omitted, keeps current height.

    Returns:
        Confirmation with new canvas size.
    """
    diagram = state.get()
    state.push_history()
    if width is not None:
        diagram.canvas.width = width
    if height is not None:
        diagram.canvas.height = height
    return f"Canvas resized to {diagram.canvas.width}x{diagram.canvas.height}"
