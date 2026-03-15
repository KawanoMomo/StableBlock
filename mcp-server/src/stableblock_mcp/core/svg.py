"""SVG renderer — converts a Diagram to SVG string.

Ported from stableblock.html renderSVG/getConn/bpath (L216-267).
"""

from __future__ import annotations

import html
import math

from stableblock_mcp.models.types import Block, Connection, Diagram


def _esc(text: str) -> str:
    return html.escape(text, quote=True)


def _get_conn(fb: Block, tb: Block, grid: int) -> tuple[dict, dict]:
    """Calculate connection endpoints between two blocks."""
    g = grid
    fcx = fb.x * g + fb.w * g / 2
    fcy = fb.y * g + fb.h * g / 2
    tcx = tb.x * g + tb.w * g / 2
    tcy = tb.y * g + tb.h * g / 2
    dx = tcx - fcx
    dy = tcy - fcy

    if abs(dy) > abs(dx):
        if dy > 0:
            fp = {"x": fcx, "y": fb.y * g + fb.h * g}
            tp = {"x": tcx, "y": tb.y * g}
        else:
            fp = {"x": fcx, "y": fb.y * g}
            tp = {"x": tcx, "y": tb.y * g + tb.h * g}
    else:
        if dx > 0:
            fp = {"x": fb.x * g + fb.w * g, "y": fcy}
            tp = {"x": tb.x * g, "y": tcy}
        else:
            fp = {"x": fb.x * g, "y": fcy}
            tp = {"x": tb.x * g + tb.w * g, "y": tcy}

    return fp, tp


def _bpath(fp: dict, tp: dict) -> str:
    """Generate a cubic bezier path between two points."""
    mx = (fp["x"] + tp["x"]) / 2
    my = (fp["y"] + tp["y"]) / 2
    if abs(tp["y"] - fp["y"]) > abs(tp["x"] - fp["x"]):
        return (
            f'M{fp["x"]},{fp["y"]} '
            f'C{fp["x"]},{my} {tp["x"]},{my} {tp["x"]},{tp["y"]}'
        )
    else:
        return (
            f'M{fp["x"]},{fp["y"]} '
            f'C{mx},{fp["y"]} {mx},{tp["y"]} {tp["x"]},{tp["y"]}'
        )


def render_svg(diagram: Diagram) -> str:
    """Render a Diagram to an SVG string."""
    canvas = diagram.canvas
    g = canvas.grid
    block_map = {b.id: b for b in diagram.blocks}

    parts: list[str] = []

    # SVG header
    parts.append(
        f'<svg width="{canvas.width}" height="{canvas.height}" '
        f'viewBox="0 0 {canvas.width} {canvas.height}" '
        f'xmlns="http://www.w3.org/2000/svg" '
        f"style=\"font-family:'IBM Plex Sans','Noto Sans JP',sans-serif\">"
    )

    # Defs: grid pattern + arrow markers
    parts.append(f'<defs>')
    parts.append(
        f'<pattern id="gd" width="{g}" height="{g}" patternUnits="userSpaceOnUse">'
        f'<circle cx="{g / 2}" cy="{g / 2}" r="0.5" fill="#CBD5E1" opacity="0.5"/>'
        f'</pattern>'
    )
    for i, c in enumerate(diagram.connections):
        parts.append(
            f'<marker id="a{i}" viewBox="0 0 10 7" refX="9" refY="3.5" '
            f'markerWidth="8" markerHeight="6" orient="auto-start-reverse">'
            f'<path d="M0,0 L10,3.5 L0,7 Z" fill="{c.color}"/></marker>'
        )
    parts.append('</defs>')

    # Background
    parts.append('<rect width="100%" height="100%" fill="url(#gd)"/>')

    # Groups
    for gr in diagram.groups:
        parts.append(
            f'<g><rect x="{gr.x * g}" y="{gr.y * g}" '
            f'width="{gr.w * g}" height="{gr.h * g}" '
            f'fill="{gr.color}" stroke="{gr.border_color}" '
            f'stroke-width="1.5" rx="8" opacity="0.85"/>'
        )
        parts.append(
            f'<text x="{gr.x * g + 8}" y="{gr.y * g + 14}" '
            f'font-size="11" font-weight="600" fill="{gr.border_color}" '
            f'opacity="0.9">{_esc(gr.label)}</text></g>'
        )

    # Connections
    for i, c in enumerate(diagram.connections):
        fb = block_map.get(c.from_id)
        tb = block_map.get(c.to_id)
        if not fb or not tb:
            continue
        fp, tp = _get_conn(fb, tb, g)
        dash = ' stroke-dasharray="6,3"' if c.style == "dashed" else ""
        marker_start = f' marker-start="url(#a{i})"' if c.bidirectional else ""
        parts.append(
            f'<path d="{_bpath(fp, tp)}" fill="none" stroke="{c.color}" '
            f'stroke-width="1.5"{dash} marker-end="url(#a{i})"{marker_start}/>'
        )
        if c.label:
            mx = (fp["x"] + tp["x"]) / 2
            my = (fp["y"] + tp["y"]) / 2 - 5
            parts.append(
                f'<text x="{mx}" y="{my}" font-size="10" fill="{c.color}" '
                f'text-anchor="middle" font-weight="500">{_esc(c.label)}</text>'
            )

    # Blocks
    for b in diagram.blocks:
        sw = 2.5 if b.style == "bold" else 1
        dash = ' stroke-dasharray="6,3"' if b.style == "dashed" else ""
        stroke_color = b.border_color or b.color
        flt = "drop-shadow(0 1px 2px rgba(0,0,0,0.12))"
        parts.append(
            f'<g><rect x="{b.x * g}" y="{b.y * g}" '
            f'width="{b.w * g}" height="{b.h * g}" '
            f'fill="{b.color}" stroke="{stroke_color}" '
            f'stroke-width="{sw}"{dash} rx="{b.round}" '
            f'style="filter:{flt}"/>'
        )
        # Support \n in labels
        label_lines = b.label.split("\\n")
        for li, line_text in enumerate(label_lines):
            ty = b.y * g + b.h * g / 2 + (li - (len(label_lines) - 1) / 2) * 14
            parts.append(
                f'<text x="{b.x * g + b.w * g / 2}" y="{ty}" '
                f'font-size="11" font-weight="600" fill="{b.text_color}" '
                f'text-anchor="middle" dominant-baseline="central">'
                f'{_esc(line_text)}</text>'
            )
        parts.append('</g>')

    parts.append('</svg>')
    return "\n".join(parts)
