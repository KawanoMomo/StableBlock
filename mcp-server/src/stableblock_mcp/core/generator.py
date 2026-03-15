"""Diagram model → DSL text generator."""

from __future__ import annotations

from stableblock_mcp.models.types import Block, Connection, Diagram, Group


def _block_line(b: Block) -> str:
    parts = [f'block {b.id} "{b.label}" at {b.x:g},{b.y:g} size {b.w:g}x{b.h:g}']
    parts.append(f"color={b.color}")
    parts.append(f"text={b.text_color}")
    if b.border_color:
        parts.append(f"border={b.border_color}")
    parts.append(f"round={b.round}")
    if b.style != "solid":
        parts.append(f"style={b.style}")
    return " ".join(parts)


def _group_line(g: Group) -> str:
    parts = [f'group {g.id} "{g.label}" at {g.x:g},{g.y:g} size {g.w:g}x{g.h:g}']
    parts.append(f"color={g.color}")
    parts.append(f"border={g.border_color}")
    return " ".join(parts)


def _conn_line(c: Connection) -> str:
    arrow = "-->" if c.bidirectional else "->"
    parts = [f"{c.from_id} {arrow} {c.to_id}"]
    if c.label:
        parts.append(f'"{c.label}"')
    if c.color != "#64748B":
        parts.append(f"color={c.color}")
    if c.style != "solid":
        parts.append(f"style={c.style}")
    return " ".join(parts)


def generate_dsl(diagram: Diagram) -> str:
    """Generate DSL text from a Diagram model."""
    lines: list[str] = []
    lines.append("# StableBlock v0.4")
    c = diagram.canvas
    lines.append(f"@canvas width={c.width} height={c.height} grid={c.grid}")
    lines.append("")

    # Build group → blocks mapping
    group_blocks: dict[str, list[Block]] = {g.id: [] for g in diagram.groups}
    ungrouped: list[Block] = []
    for b in diagram.blocks:
        if b.group_id and b.group_id in group_blocks:
            group_blocks[b.group_id].append(b)
        else:
            ungrouped.append(b)

    # Groups with their blocks
    for g in diagram.groups:
        lines.append(f"# {g.label}")
        lines.append(_group_line(g))
        lines.append("")
        for b in group_blocks[g.id]:
            lines.append(_block_line(b))
        if group_blocks[g.id]:
            lines.append("")

    # Ungrouped blocks
    if ungrouped:
        lines.append("# Blocks")
        for b in ungrouped:
            lines.append(_block_line(b))
        lines.append("")

    # Connections
    if diagram.connections:
        lines.append("# Connections")
        for conn in diagram.connections:
            lines.append(_conn_line(conn))
        lines.append("")

    return "\n".join(lines)
