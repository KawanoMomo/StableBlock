"""Layout validation — detect overlaps, overflows, and other issues."""

from __future__ import annotations

import math

from stableblock_mcp.models.types import Block, Diagram, Group


def _rects_overlap(ax: float, ay: float, aw: float, ah: float,
                   bx: float, by: float, bw: float, bh: float) -> bool:
    """Check if two axis-aligned rectangles overlap (excluding touching edges)."""
    return ax < bx + bw and ax + aw > bx and ay < by + bh and ay + ah > by


def _is_inside(inner_x: float, inner_y: float, inner_w: float, inner_h: float,
               outer_x: float, outer_y: float, outer_w: float, outer_h: float) -> bool:
    """Check if inner rect is fully contained within outer rect."""
    return (inner_x >= outer_x and inner_y >= outer_y
            and inner_x + inner_w <= outer_x + outer_w
            and inner_y + inner_h <= outer_y + outer_h)


def _estimate_text_width(label: str) -> float:
    """Estimate text width in grid units (rough: ~1 grid unit per 2.5 chars)."""
    lines = label.replace("\\n", "\n").split("\n")
    max_len = max(len(line) for line in lines) if lines else 0
    return max_len / 2.5


def _estimate_text_height(label: str) -> float:
    """Estimate text height in grid units (rough: ~1 grid unit per line)."""
    lines = label.replace("\\n", "\n").split("\n")
    return len(lines)


def validate_layout(diagram: Diagram) -> list[dict]:
    """Validate diagram layout, returning a list of issues.

    Each issue is a dict with:
        - severity: "error" | "warning"
        - type: issue category
        - ids: list of involved element IDs
        - message: human-readable description
        - suggestion: recommended fix
    """
    issues: list[dict] = []
    canvas_w = diagram.canvas.width / diagram.canvas.grid
    canvas_h = diagram.canvas.height / diagram.canvas.grid

    # 1. Block-Block overlaps
    for i, a in enumerate(diagram.blocks):
        for b in diagram.blocks[i + 1:]:
            if _rects_overlap(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h):
                issues.append({
                    "severity": "error",
                    "type": "block_overlap",
                    "ids": [a.id, b.id],
                    "message": f"Blocks '{a.id}' and '{b.id}' overlap",
                    "suggestion": f"Move '{b.id}' or use sb_auto_layout to fix positions",
                })

    # 2. Group-Group overlaps (same-level, not nested)
    for i, a in enumerate(diagram.groups):
        for b in diagram.groups[i + 1:]:
            # Skip if one contains the other (nesting is OK)
            if (_is_inside(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h)
                    or _is_inside(b.x, b.y, b.w, b.h, a.x, a.y, a.w, a.h)):
                continue
            if _rects_overlap(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h):
                issues.append({
                    "severity": "error",
                    "type": "group_overlap",
                    "ids": [a.id, b.id],
                    "message": f"Groups '{a.id}' and '{b.id}' overlap",
                    "suggestion": f"Adjust group positions or use sb_auto_layout",
                })

    # 3. Block outside its parent group
    group_map = {g.id: g for g in diagram.groups}
    for block in diagram.blocks:
        if block.group_id and block.group_id in group_map:
            g = group_map[block.group_id]
            if not _is_inside(block.x, block.y, block.w, block.h,
                              g.x, g.y, g.w, g.h):
                issues.append({
                    "severity": "error",
                    "type": "block_outside_group",
                    "ids": [block.id, block.group_id],
                    "message": f"Block '{block.id}' extends outside its group '{block.group_id}'",
                    "suggestion": f"Move block inside group or expand the group with sb_modify",
                })

    # 4. Elements outside canvas
    for block in diagram.blocks:
        if (block.x < 0 or block.y < 0
                or block.x + block.w > canvas_w
                or block.y + block.h > canvas_h):
            issues.append({
                "severity": "warning",
                "type": "outside_canvas",
                "ids": [block.id],
                "message": f"Block '{block.id}' is outside the canvas ({canvas_w}x{canvas_h} grid)",
                "suggestion": f"Move block inside canvas or resize canvas",
            })
    for group in diagram.groups:
        if (group.x < 0 or group.y < 0
                or group.x + group.w > canvas_w
                or group.y + group.h > canvas_h):
            issues.append({
                "severity": "warning",
                "type": "outside_canvas",
                "ids": [group.id],
                "message": f"Group '{group.id}' is outside the canvas ({canvas_w}x{canvas_h} grid)",
                "suggestion": f"Move group inside canvas or resize canvas",
            })

    # 5. Text overflow — label too wide/tall for block
    for block in diagram.blocks:
        text_w = _estimate_text_width(block.label)
        text_h = _estimate_text_height(block.label)
        if text_w > block.w:
            issues.append({
                "severity": "warning",
                "type": "text_overflow",
                "ids": [block.id],
                "message": (f"Block '{block.id}' label \"{block.label}\" "
                            f"is too wide (est. {text_w:.1f} grid) for block width ({block.w})"),
                "suggestion": f"Widen block to at least {math.ceil(text_w)} or shorten the label",
            })
        if text_h > block.h:
            issues.append({
                "severity": "warning",
                "type": "text_overflow",
                "ids": [block.id],
                "message": (f"Block '{block.id}' label has {int(text_h)} lines "
                            f"but block height is only {block.h}"),
                "suggestion": f"Increase block height to at least {math.ceil(text_h)} or reduce label lines",
            })

    # 6. Text overflow for group labels
    for group in diagram.groups:
        text_w = _estimate_text_width(group.label)
        if text_w > group.w:
            issues.append({
                "severity": "warning",
                "type": "text_overflow",
                "ids": [group.id],
                "message": (f"Group '{group.id}' label \"{group.label}\" "
                            f"is too wide (est. {text_w:.1f} grid) for group width ({group.w})"),
                "suggestion": f"Widen group to at least {math.ceil(text_w)} or shorten the label",
            })

    return issues
