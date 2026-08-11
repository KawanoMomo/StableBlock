"""DSL parser — converts .sb text into a Diagram model.

Ported from stableblock.html parseDSL() (L184-201).
"""

from __future__ import annotations

import re

from stableblock_mcp.models.types import (
    Block,
    CanvasSettings,
    Connection,
    Diagram,
    Group,
)

# Pre-compiled patterns
_RE_CANVAS = re.compile(r"^@canvas\b")
_RE_BLOCK = re.compile(
    r'^block\s+(\S+)\s+"([^"]*)"\s+at\s+([\d.]+),([\d.]+)\s+size\s+([\d.]+)x([\d.]+)(.*)'
)
_RE_GROUP = re.compile(
    r'^group\s+(\S+)\s+"([^"]*)"\s+at\s+([\d.]+),([\d.]+)\s+size\s+([\d.]+)x([\d.]+)(.*)'
)
_RE_CONN = re.compile(
    r'^(\S+)\s+(-->|->)\s+(\S+)\s*(?:"([^"]*)")?\s*(.*)'
)


def _extract(rest: str, key: str, default: str) -> str:
    m = re.search(rf"{key}=(\S+)", rest)
    return m.group(1) if m else default


def parse_dsl(text: str) -> Diagram:
    """Parse DSL text into a Diagram. Invalid lines are silently ignored."""
    canvas = CanvasSettings()
    blocks: list[Block] = []
    groups: list[Group] = []
    connections: list[Connection] = []

    for line in text.split("\n"):
        raw = line.strip()
        if not raw or raw.startswith("#"):
            continue

        # @canvas
        if _RE_CANVAS.match(raw):
            w = re.search(r"width=(\d+)", raw)
            h = re.search(r"height=(\d+)", raw)
            g = re.search(r"grid=(\d+)", raw)
            if w:
                canvas.width = int(w.group(1))
            if h:
                canvas.height = int(h.group(1))
            if g:
                canvas.grid = int(g.group(1))
            continue

        # block
        m = _RE_BLOCK.match(raw)
        if m:
            bid, label, x, y, w, h, rest = m.groups()
            blocks.append(
                Block(
                    id=bid,
                    label=label,
                    x=float(x),
                    y=float(y),
                    w=float(w),
                    h=float(h),
                    color=_extract(rest, "color", "#3B82F6"),
                    text_color=_extract(rest, "text", "#FFFFFF"),
                    border_color=_extract(rest, "border", None) or None,
                    round=int(_extract(rest, "round", "4")),
                    style=_extract(rest, "style", "solid"),
                )
            )
            continue

        # group
        m = _RE_GROUP.match(raw)
        if m:
            gid, label, x, y, w, h, rest = m.groups()
            groups.append(
                Group(
                    id=gid,
                    label=label,
                    x=float(x),
                    y=float(y),
                    w=float(w),
                    h=float(h),
                    color=_extract(rest, "color", "#F3F4F6"),
                    border_color=_extract(rest, "border", "#9CA3AF"),
                )
            )
            continue

        # connection
        m = _RE_CONN.match(raw)
        if m:
            from_id, arrow, to_id, label, rest = m.groups()
            connections.append(
                Connection(
                    from_id=from_id,
                    to_id=to_id,
                    label=label or "",
                    color=_extract(rest or "", "color", "#64748B"),
                    style=_extract(rest or "", "style", "solid"),
                    bidirectional=(arrow == "-->"),
                )
            )
            continue

    return Diagram(canvas=canvas, blocks=blocks, groups=groups, connections=connections)
