"""Export tools: sb_export_svg."""

from __future__ import annotations

from pathlib import Path

from stableblock_mcp import state
from stableblock_mcp.core.svg import render_svg


def sb_export_svg(output_path: str) -> str:
    """Export the current diagram as an SVG file.

    Args:
        output_path: Path where the SVG file will be saved.

    Returns:
        Confirmation message with file size.
    """
    diagram = state.get()
    svg_text = render_svg(diagram)
    p = Path(output_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(svg_text, encoding="utf-8")
    return f"Exported SVG to {output_path} ({len(svg_text)} bytes)"
