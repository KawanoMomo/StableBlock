"""SVG renderer — converts a Diagram to SVG string.

Ported from stableblock.html renderSVG with edge-gap side selection,
port distribution, and bezier curves with control-point tangents.
"""

from __future__ import annotations

import html
import math

from stableblock_mcp.models.types import Block, Connection, Diagram


def _esc(text: str) -> str:
    return html.escape(text, quote=True)


def _get_side(fb: Block, tb: Block) -> dict:
    """Edge-gap based side selection (matches GUI getSide)."""
    gap_b = tb.y - (fb.y + fb.h)
    gap_t = fb.y - (tb.y + tb.h)
    gap_r = tb.x - (fb.x + fb.w)
    gap_l = fb.x - (tb.x + tb.w)
    v_best = max(gap_b, gap_t)
    h_best = max(gap_r, gap_l)
    if v_best >= h_best:
        return {"fs": "bottom", "ts": "top"} if gap_b >= gap_t else {"fs": "top", "ts": "bottom"}
    return {"fs": "right", "ts": "left"} if gap_r >= gap_l else {"fs": "left", "ts": "right"}


def _port_pos(b: Block, side: str, idx: int, total: int, g: int) -> dict:
    """Calculate port position along a block edge with distribution."""
    bx, by, bw, bh = b.x * g, b.y * g, b.w * g, b.h * g
    pad = 0.2
    t = 0.5 if total == 1 else pad + (1 - 2 * pad) * idx / (total - 1)
    if side == "top":
        return {"x": bx + bw * t, "y": by}
    if side == "bottom":
        return {"x": bx + bw * t, "y": by + bh}
    if side == "left":
        return {"x": bx, "y": by + bh * t}
    return {"x": bx + bw, "y": by + bh * t}


def _compute_ports(connections: list[Connection], block_map: dict[str, Block], g: int) -> list[dict | None]:
    """Pre-compute all port positions with sorting (matches GUI computePorts)."""
    sides = []
    for c in connections:
        fb = block_map.get(c.from_id)
        tb = block_map.get(c.to_id)
        sides.append(_get_side(fb, tb) if fb and tb else None)

    # Build side map: block_id -> side -> [{ci, ox, oy}]
    sm: dict[str, dict[str, list]] = {}
    for i, c in enumerate(connections):
        if not sides[i]:
            continue
        fb = block_map.get(c.from_id)
        tb = block_map.get(c.to_id)
        if not fb or not tb:
            continue
        fs, ts = sides[i]["fs"], sides[i]["ts"]
        sm.setdefault(c.from_id, {}).setdefault(fs, []).append(
            {"ci": i, "ox": tb.x + tb.w / 2, "oy": tb.y + tb.h / 2}
        )
        sm.setdefault(c.to_id, {}).setdefault(ts, []).append(
            {"ci": i, "ox": fb.x + fb.w / 2, "oy": fb.y + fb.h / 2}
        )

    # Sort ports on each side
    for bid in sm:
        for sd in sm[bid]:
            key = "oy" if sd in ("left", "right") else "ox"
            sm[bid][sd].sort(key=lambda p: p[key])

    # Build result
    result = []
    for i, c in enumerate(connections):
        if not sides[i]:
            result.append(None)
            continue
        fb = block_map.get(c.from_id)
        tb = block_map.get(c.to_id)
        if not fb or not tb:
            result.append(None)
            continue
        fs, ts = sides[i]["fs"], sides[i]["ts"]
        fl = sm[c.from_id][fs]
        tl = sm[c.to_id][ts]
        fi = next(j for j, p in enumerate(fl) if p["ci"] == i)
        ti = next(j for j, p in enumerate(tl) if p["ci"] == i)
        result.append({
            "fp": _port_pos(fb, fs, fi, len(fl), g),
            "tp": _port_pos(tb, ts, ti, len(tl), g),
            "fs": fs,
            "ts": ts,
        })
    return result


def _ext_pt(p: dict, side: str, d: float) -> dict:
    """Extend point along side normal."""
    if side == "top":
        return {"x": p["x"], "y": p["y"] - d}
    if side == "bottom":
        return {"x": p["x"], "y": p["y"] + d}
    if side == "left":
        return {"x": p["x"] - d, "y": p["y"]}
    return {"x": p["x"] + d, "y": p["y"]}


def _bpath(fp: dict, tp: dict, fs: str, ts: str) -> str:
    """Generate cubic bezier with control points on edge normals."""
    dx = tp["x"] - fp["x"]
    dy = tp["y"] - fp["y"]
    dist = math.sqrt(dx * dx + dy * dy)
    cpd = max(30, dist * 0.4)
    c1 = _ext_pt(fp, fs, cpd)
    c2 = _ext_pt(tp, ts, cpd)
    return (
        f'M{fp["x"]},{fp["y"]} '
        f'C{c1["x"]},{c1["y"]} {c2["x"]},{c2["y"]} {tp["x"]},{tp["y"]}'
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
    parts.append('<defs>')
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

    # Connections — with port distribution and bezier curves
    ports = _compute_ports(diagram.connections, block_map, g)
    for i, c in enumerate(diagram.connections):
        port = ports[i]
        if not port:
            continue
        fp, tp, fs, ts = port["fp"], port["tp"], port["fs"], port["ts"]
        dash = ' stroke-dasharray="6,3"' if c.style == "dashed" else ""
        marker_start = f' marker-start="url(#a{i})"' if c.bidirectional else ""
        parts.append(
            f'<path d="{_bpath(fp, tp, fs, ts)}" fill="none" stroke="{c.color}" '
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
