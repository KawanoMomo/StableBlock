"""Element manipulation tools: sb_add_block, sb_add_group, sb_connect, sb_remove, sb_modify, sb_move_to_group."""

from __future__ import annotations

from stableblock_mcp import state
from stableblock_mcp.core.layout import (
    BLOCK_H,
    BLOCK_W,
    place_block_free,
    place_block_in_group,
    place_new_group,
)
from stableblock_mcp.core.templates import COLOR_THEMES
from stableblock_mcp.models.types import Block, Connection, Group


def sb_add_block(
    id: str,
    label: str,
    group_id: str | None = None,
    color: str | None = None,
    text_color: str | None = None,
    style: str = "solid",
) -> str:
    """Add a block to the diagram with automatic positioning.

    Args:
        id: Unique identifier for the block (e.g. "auth_service").
        label: Display label text.
        group_id: Optional group to place the block in. Auto-positions within group.
        color: Background color (hex). Defaults to group theme or #3B82F6.
        text_color: Text color (hex). Defaults to #FFFFFF.
        style: "solid", "dashed", or "bold".

    Returns:
        Confirmation with block position.
    """
    diagram = state.get()

    # Check for duplicate id
    if any(b.id == id for b in diagram.blocks):
        return f"Error: Block '{id}' already exists"
    if any(g.id == id for g in diagram.groups):
        return f"Error: ID '{id}' is already used by a group"

    state.push_history()
    block = Block(
        id=id,
        label=label,
        x=0, y=0, w=BLOCK_W, h=BLOCK_H,
        color=color or "#3B82F6",
        text_color=text_color or "#FFFFFF",
        style=style,
        group_id=group_id,
    )

    # Find group and apply theme colors if not specified
    if group_id:
        group = next((g for g in diagram.groups if g.id == group_id), None)
        if not group:
            return f"Error: Group '{group_id}' not found"
        # Inherit color from sibling blocks if available
        siblings = [b for b in diagram.blocks if b.group_id == group_id]
        if siblings and not color:
            block.color = siblings[0].color
            block.text_color = siblings[0].text_color
        diagram.blocks.append(block)
        place_block_in_group(diagram, block, group)
    else:
        diagram.blocks.append(block)
        place_block_free(diagram, block)

    return f"Added block '{id}' at ({block.x:g},{block.y:g})"


def sb_add_group(
    id: str,
    label: str,
    color_theme: str | None = None,
) -> str:
    """Add a group to the diagram with automatic positioning.

    Args:
        id: Unique identifier for the group.
        label: Display label text.
        color_theme: Color theme name: "blue", "amber", "green", "gray", "red", "purple".

    Returns:
        Confirmation with group position.
    """
    diagram = state.get()

    if any(g.id == id for g in diagram.groups):
        return f"Error: Group '{id}' already exists"
    if any(b.id == id for b in diagram.blocks):
        return f"Error: ID '{id}' is already used by a block"

    state.push_history()
    group_color = "#F3F4F6"
    border_color = "#9CA3AF"
    if color_theme and color_theme in COLOR_THEMES:
        theme = COLOR_THEMES[color_theme]
        group_color = theme[0]
        border_color = theme[1]

    group = Group(
        id=id, label=label,
        x=0, y=0, w=0, h=0,
        color=group_color, border_color=border_color,
    )
    diagram.groups.append(group)
    place_new_group(diagram, group)

    return f"Added group '{id}' at ({group.x:g},{group.y:g}) size {group.w:g}x{group.h:g}"


def sb_connect(
    from_id: str,
    to_id: str,
    label: str = "",
    bidirectional: bool = False,
    color: str = "#64748B",
    style: str = "solid",
) -> str:
    """Add a connection between two blocks.

    Args:
        from_id: Source block ID.
        to_id: Target block ID.
        label: Optional label on the connection.
        bidirectional: If true, arrows on both ends.
        color: Connection color (hex).
        style: "solid" or "dashed".

    Returns:
        Confirmation message.
    """
    diagram = state.get()
    block_ids = {b.id for b in diagram.blocks}

    if from_id not in block_ids:
        return f"Error: Block '{from_id}' not found"
    if to_id not in block_ids:
        return f"Error: Block '{to_id}' not found"

    # Check for duplicate connection
    for c in diagram.connections:
        if c.from_id == from_id and c.to_id == to_id:
            return f"Error: Connection {from_id} -> {to_id} already exists"

    state.push_history()
    diagram.connections.append(
        Connection(
            from_id=from_id,
            to_id=to_id,
            label=label,
            color=color,
            style=style,
            bidirectional=bidirectional,
        )
    )
    arrow = "<->" if bidirectional else "->"
    return f"Connected {from_id} {arrow} {to_id}"


def sb_remove(id: str) -> str:
    """Remove an element (block or group) and its related connections.

    Args:
        id: ID of the block or group to remove.

    Returns:
        Confirmation of what was removed.
    """
    diagram = state.get()
    removed: list[str] = []

    # Remove block
    block = next((b for b in diagram.blocks if b.id == id), None)
    if block:
        state.push_history()
        diagram.blocks.remove(block)
        removed.append(f"block '{id}'")
        # Remove connections involving this block
        before = len(diagram.connections)
        diagram.connections = [
            c for c in diagram.connections
            if c.from_id != id and c.to_id != id
        ]
        conn_removed = before - len(diagram.connections)
        if conn_removed:
            removed.append(f"{conn_removed} connection(s)")
        return f"Removed {', '.join(removed)}"

    # Remove group
    group = next((g for g in diagram.groups if g.id == id), None)
    if group:
        state.push_history()
        diagram.groups.remove(group)
        removed.append(f"group '{id}'")
        # Unset group_id on blocks in this group
        for b in diagram.blocks:
            if b.group_id == id:
                b.group_id = None
        return f"Removed {', '.join(removed)} (blocks kept, ungrouped)"

    return f"Error: Element '{id}' not found"


def sb_modify(
    id: str,
    label: str | None = None,
    x: float | None = None,
    y: float | None = None,
    w: float | None = None,
    h: float | None = None,
    color: str | None = None,
    text_color: str | None = None,
    border_color: str | None = None,
    style: str | None = None,
    round: int | None = None,
) -> str:
    """Modify properties of an existing block or group.

    Args:
        id: ID of the element to modify.
        label: New label text.
        x: New X position (grid units).
        y: New Y position (grid units).
        w: New width (grid units).
        h: New height (grid units).
        color: New background color (hex).
        text_color: New text color (hex, blocks only).
        border_color: New border color (hex).
        style: New style ("solid", "dashed", "bold" for blocks; ignored for groups).
        round: New corner radius (blocks only).

    Returns:
        Confirmation of changes made.
    """
    diagram = state.get()
    state.push_history()
    changes: list[str] = []

    # Try block
    block = next((b for b in diagram.blocks if b.id == id), None)
    if block:
        if label is not None:
            block.label = label
            changes.append(f"label='{label}'")
        if x is not None:
            block.x = x
            changes.append(f"x={x:g}")
        if y is not None:
            block.y = y
            changes.append(f"y={y:g}")
        if w is not None:
            block.w = w
            changes.append(f"w={w:g}")
        if h is not None:
            block.h = h
            changes.append(f"h={h:g}")
        if color is not None:
            block.color = color
            changes.append(f"color={color}")
        if text_color is not None:
            block.text_color = text_color
            changes.append(f"text_color={text_color}")
        if border_color is not None:
            block.border_color = border_color
            changes.append(f"border_color={border_color}")
        if style is not None:
            block.style = style
            changes.append(f"style={style}")
        if round is not None:
            block.round = round
            changes.append(f"round={round}")
        if not changes:
            return "No changes specified"
        return f"Modified block '{id}': {', '.join(changes)}"

    # Try group
    group = next((g for g in diagram.groups if g.id == id), None)
    if group:
        if label is not None:
            group.label = label
            changes.append(f"label='{label}'")
        if x is not None:
            group.x = x
            changes.append(f"x={x:g}")
        if y is not None:
            group.y = y
            changes.append(f"y={y:g}")
        if w is not None:
            group.w = w
            changes.append(f"w={w:g}")
        if h is not None:
            group.h = h
            changes.append(f"h={h:g}")
        if color is not None:
            group.color = color
            changes.append(f"color={color}")
        if border_color is not None:
            group.border_color = border_color
            changes.append(f"border_color={border_color}")
        if not changes:
            return "No changes specified"
        return f"Modified group '{id}': {', '.join(changes)}"

    return f"Error: Element '{id}' not found"


def sb_move_to_group(
    block_id: str,
    group_id: str | None = None,
) -> str:
    """Move a block into a different group (or ungroup it).

    The block is automatically repositioned within the target group.

    Args:
        block_id: ID of the block to move.
        group_id: Target group ID. If None, the block is ungrouped.

    Returns:
        Confirmation with new position.
    """
    diagram = state.get()
    state.push_history()

    block = next((b for b in diagram.blocks if b.id == block_id), None)
    if not block:
        return f"Error: Block '{block_id}' not found"

    if group_id is None:
        block.group_id = None
        place_block_free(diagram, block)
        return f"Ungrouped block '{block_id}', moved to ({block.x:g},{block.y:g})"

    group = next((g for g in diagram.groups if g.id == group_id), None)
    if not group:
        return f"Error: Group '{group_id}' not found"

    block.group_id = group_id
    place_block_in_group(diagram, block, group)
    return f"Moved block '{block_id}' to group '{group_id}' at ({block.x:g},{block.y:g})"
