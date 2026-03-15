"""Diagram management tools: sb_new, sb_open, sb_save, sb_show."""

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


def sb_show() -> dict:
    """Get the current diagram state as a structured summary.

    Returns:
        Structured summary of the diagram including blocks, groups,
        connections, and canvas size — designed for LLM consumption.
    """
    summary = state.summarize()
    return summary.model_dump()
