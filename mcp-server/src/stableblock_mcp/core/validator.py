"""Semantic validation for Diagram models."""

from __future__ import annotations

from stableblock_mcp.models.types import Diagram


def validate_diagram(diagram: Diagram) -> list[str]:
    """Return a list of validation errors (empty = valid)."""
    errors: list[str] = []
    block_ids = {b.id for b in diagram.blocks}
    group_ids = {g.id for g in diagram.groups}
    all_ids = block_ids | group_ids

    # Duplicate IDs
    seen: set[str] = set()
    for b in diagram.blocks:
        if b.id in seen:
            errors.append(f"Duplicate block id: {b.id}")
        seen.add(b.id)
    for g in diagram.groups:
        if g.id in seen:
            errors.append(f"Duplicate id (group conflicts): {g.id}")
        seen.add(g.id)

    # Connection references
    for c in diagram.connections:
        if c.from_id not in block_ids:
            errors.append(f"Connection from unknown block: {c.from_id}")
        if c.to_id not in block_ids:
            errors.append(f"Connection to unknown block: {c.to_id}")

    # Block group_id references
    for b in diagram.blocks:
        if b.group_id and b.group_id not in group_ids:
            errors.append(f"Block {b.id} references unknown group: {b.group_id}")

    return errors
