"""Module-level diagram state management for MCP session."""

from __future__ import annotations

from stableblock_mcp.models.types import (
    BlockDetail,
    ConnectionSummary,
    Diagram,
    DiagramDetail,
    DiagramSummary,
    GroupDetail,
    GroupSummary,
)

# The current diagram state — one per MCP server process
_current: Diagram | None = None

# Undo history — snapshots of previous states
_history: list[str] = []
_MAX_HISTORY = 30


def get() -> Diagram:
    """Get the current diagram. Raises if none exists."""
    if _current is None:
        raise RuntimeError("No diagram. Use sb_new or sb_open first.")
    return _current


def push_history() -> None:
    """Save a snapshot of the current state for undo."""
    if _current is None:
        return
    snapshot = _current.model_dump_json()
    _history.append(snapshot)
    if len(_history) > _MAX_HISTORY:
        _history.pop(0)


def undo() -> bool:
    """Restore the previous state. Returns True if successful."""
    global _current
    if not _history:
        return False
    snapshot = _history.pop()
    _current = Diagram.model_validate_json(snapshot)
    return True


def set_diagram(diagram: Diagram) -> None:
    """Set the current diagram (pushes previous to history)."""
    global _current
    if _current is not None:
        push_history()
    _current = diagram


def clear() -> None:
    """Clear the current diagram and history."""
    global _current
    _current = None
    _history.clear()


def has_diagram() -> bool:
    return _current is not None


def summarize() -> DiagramSummary:
    """Create a structured summary of the current diagram for LLM consumption."""
    d = get()

    group_blocks: dict[str, list[str]] = {g.id: [] for g in d.groups}
    ungrouped: list[str] = []
    for b in d.blocks:
        if b.group_id and b.group_id in group_blocks:
            group_blocks[b.group_id].append(b.id)
        else:
            ungrouped.append(b.id)

    return DiagramSummary(
        block_count=len(d.blocks),
        group_count=len(d.groups),
        connection_count=len(d.connections),
        canvas=f"{d.canvas.width}x{d.canvas.height}",
        groups=[
            GroupSummary(id=g.id, label=g.label, blocks=group_blocks[g.id])
            for g in d.groups
        ],
        ungrouped_blocks=ungrouped,
        connections=[
            ConnectionSummary(
                from_id=c.from_id,
                to_id=c.to_id,
                label=c.label,
                bidirectional=c.bidirectional,
            )
            for c in d.connections
        ],
    )


def summarize_detail() -> DiagramDetail:
    """Create a detailed summary including positions, sizes, and colors."""
    d = get()

    group_blocks: dict[str, list[BlockDetail]] = {g.id: [] for g in d.groups}
    ungrouped: list[BlockDetail] = []
    for b in d.blocks:
        bd = BlockDetail(
            id=b.id, label=b.label, x=b.x, y=b.y, w=b.w, h=b.h,
            color=b.color, text_color=b.text_color, style=b.style,
            group_id=b.group_id,
        )
        if b.group_id and b.group_id in group_blocks:
            group_blocks[b.group_id].append(bd)
        else:
            ungrouped.append(bd)

    return DiagramDetail(
        block_count=len(d.blocks),
        group_count=len(d.groups),
        connection_count=len(d.connections),
        canvas=f"{d.canvas.width}x{d.canvas.height}",
        groups=[
            GroupDetail(
                id=g.id, label=g.label, x=g.x, y=g.y, w=g.w, h=g.h,
                color=g.color, border_color=g.border_color,
                blocks=group_blocks[g.id],
            )
            for g in d.groups
        ],
        ungrouped_blocks=ungrouped,
        connections=[
            ConnectionSummary(
                from_id=c.from_id, to_id=c.to_id,
                label=c.label, bidirectional=c.bidirectional,
            )
            for c in d.connections
        ],
    )
