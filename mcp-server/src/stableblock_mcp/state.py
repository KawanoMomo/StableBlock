"""Module-level diagram state management for MCP session."""

from __future__ import annotations

from stableblock_mcp.models.types import (
    ConnectionSummary,
    Diagram,
    DiagramSummary,
    GroupSummary,
)

# The current diagram state — one per MCP server process
_current: Diagram | None = None


def get() -> Diagram:
    """Get the current diagram. Raises if none exists."""
    if _current is None:
        raise RuntimeError("No diagram. Use sb_new or sb_open first.")
    return _current


def set_diagram(diagram: Diagram) -> None:
    """Set the current diagram."""
    global _current
    _current = diagram


def clear() -> None:
    """Clear the current diagram."""
    global _current
    _current = None


def has_diagram() -> bool:
    return _current is not None


def summarize() -> DiagramSummary:
    """Create a structured summary of the current diagram for LLM consumption."""
    d = get()

    # Build group → block mapping
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
