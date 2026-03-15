"""Auto-layout algorithms for StableBlock diagrams."""

from __future__ import annotations

from stableblock_mcp.models.types import Block, Diagram, Group

# Layout constants (in grid units)
BLOCK_W = 9
BLOCK_H = 3
BLOCK_GAP = 2
GROUP_PADDING_X = 1
GROUP_PADDING_TOP = 2  # space for label
GROUP_PADDING_BOTTOM = 1
GROUP_GAP = 1
CANVAS_MARGIN = 1


def place_block_in_group(diagram: Diagram, block: Block, group: Group) -> None:
    """Place a block at the next available position within a group."""
    # Find existing blocks in this group
    siblings = [b for b in diagram.blocks if b.group_id == group.id and b.id != block.id]

    # Place after the last sibling
    col = len(siblings)
    block.x = group.x + GROUP_PADDING_X + col * (BLOCK_W + BLOCK_GAP)
    block.y = group.y + GROUP_PADDING_TOP
    block.w = BLOCK_W
    block.h = BLOCK_H

    # Auto-expand group if needed
    needed_w = GROUP_PADDING_X * 2 + (col + 1) * BLOCK_W + col * BLOCK_GAP
    if needed_w > group.w:
        group.w = needed_w


def place_block_free(diagram: Diagram, block: Block) -> None:
    """Place a block on the canvas in a free area."""
    occupied_ys: set[float] = set()
    for b in diagram.blocks:
        if b.id != block.id:
            for dy in range(int(b.h) + 1):
                occupied_ys.add(b.y + dy)
    for g in diagram.groups:
        for dy in range(int(g.h) + 1):
            occupied_ys.add(g.y + dy)

    # Find first free row
    y = CANVAS_MARGIN
    while y in occupied_ys:
        y += 1
    block.x = CANVAS_MARGIN
    block.y = y
    block.w = BLOCK_W
    block.h = BLOCK_H


def place_new_group(diagram: Diagram, group: Group) -> None:
    """Place a new group below existing groups."""
    if not diagram.groups:
        group.x = CANVAS_MARGIN
        group.y = CANVAS_MARGIN
    else:
        # Find the bottom of existing groups (excluding self)
        others = [g for g in diagram.groups if g.id != group.id]
        if others:
            bottom = max(g.y + g.h for g in others)
            group.x = CANVAS_MARGIN
            group.y = bottom + GROUP_GAP
        else:
            group.x = CANVAS_MARGIN
            group.y = CANVAS_MARGIN

    # Default canvas-spanning width
    canvas_w_grid = diagram.canvas.width / diagram.canvas.grid
    group.w = canvas_w_grid - 2 * CANVAS_MARGIN
    group.h = 6


def auto_layout(diagram: Diagram, direction: str = "top-down") -> None:
    """Recalculate layout for the entire diagram."""
    # Build group → blocks mapping
    group_blocks: dict[str, list[Block]] = {g.id: [] for g in diagram.groups}
    ungrouped: list[Block] = []
    for b in diagram.blocks:
        if b.group_id and b.group_id in group_blocks:
            group_blocks[b.group_id].append(b)
        else:
            ungrouped.append(b)

    canvas_w_grid = diagram.canvas.width / diagram.canvas.grid
    y_cursor = CANVAS_MARGIN

    for g in diagram.groups:
        g.x = CANVAS_MARGIN
        g.y = y_cursor
        g.w = canvas_w_grid - 2 * CANVAS_MARGIN

        blocks = group_blocks[g.id]
        n = len(blocks)

        if n == 0:
            g.h = 6
        else:
            # Distribute blocks evenly within group
            total_block_w = n * BLOCK_W + (n - 1) * BLOCK_GAP
            start_x = g.x + max(GROUP_PADDING_X, (g.w - total_block_w) / 2)

            for i, b in enumerate(blocks):
                b.x = start_x + i * (BLOCK_W + BLOCK_GAP)
                b.y = g.y + GROUP_PADDING_TOP
                b.w = BLOCK_W
                b.h = BLOCK_H

            # Adjust group height to fit blocks
            g.h = GROUP_PADDING_TOP + BLOCK_H + GROUP_PADDING_BOTTOM

            # Adjust group width if blocks need more space
            needed_w = GROUP_PADDING_X * 2 + total_block_w
            if needed_w > g.w:
                g.w = needed_w

        y_cursor = g.y + g.h + GROUP_GAP

    # Place ungrouped blocks below groups
    for b in ungrouped:
        b.x = CANVAS_MARGIN
        b.y = y_cursor
        b.w = BLOCK_W
        b.h = BLOCK_H
        y_cursor += BLOCK_H + 1

    # Auto-resize canvas to fit all content
    max_y = y_cursor + CANVAS_MARGIN
    max_x = canvas_w_grid
    for g in diagram.groups:
        max_x = max(max_x, g.x + g.w + CANVAS_MARGIN)
        max_y = max(max_y, g.y + g.h + CANVAS_MARGIN)
    for b in diagram.blocks:
        max_x = max(max_x, b.x + b.w + CANVAS_MARGIN)
        max_y = max(max_y, b.y + b.h + CANVAS_MARGIN)

    diagram.canvas.width = max(diagram.canvas.width, int(max_x * diagram.canvas.grid))
    diagram.canvas.height = max(diagram.canvas.height, int(max_y * diagram.canvas.grid))
