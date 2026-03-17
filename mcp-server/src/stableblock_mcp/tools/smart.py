"""Smart tools: sb_from_template, sb_auto_layout, sb_validate_layout, sb_fix_ids."""

from __future__ import annotations

import re

from stableblock_mcp import state
from stableblock_mcp.core.layout import auto_layout
from stableblock_mcp.core.templates import TEMPLATES, apply_template
from stableblock_mcp.core.validate_layout import validate_layout


def sb_from_template(
    template: str,
    data: dict,
) -> dict:
    """Generate a diagram from a template.

    Args:
        template: Template name — "layered", "pipeline", or "grid".
        data: Template-specific data. See examples below.

    Templates:
        layered: {"layers": [{"label": "...", "blocks": ["...", ...], "color_theme"?: "..."}, ...], "connect_adjacent"?: true}
        pipeline: {"stages": ["...", ...], "direction"?: "horizontal"|"vertical", "color_theme"?: "..."}
        grid: {"rows": [["...", ...], ...], "color_theme"?: "..."}

    Returns:
        Structured summary of the generated diagram.
    """
    template = template.strip().strip('"').strip("'")
    diagram = apply_template(template, data)
    state.set_diagram(diagram)
    summary = state.summarize()
    return summary.model_dump()


def sb_auto_layout(direction: str = "top-down") -> dict:
    """Recalculate layout for the entire diagram.

    Repositions all groups and blocks for optimal arrangement.
    Groups are stacked top-to-bottom, blocks within groups are
    evenly distributed horizontally.

    Args:
        direction: Layout direction (currently only "top-down" is supported).

    Returns:
        Structured summary after relayout.
    """
    diagram = state.get()
    state.push_history()
    auto_layout(diagram, direction)
    summary = state.summarize()
    return summary.model_dump()


def sb_validate_layout() -> dict:
    """Check the current diagram for layout problems.

    Detects:
        - Block-block overlaps
        - Group-group overlaps
        - Blocks extending outside their parent group
        - Elements outside the canvas
        - Text labels overflowing block/group boundaries

    Returns:
        {"ok": bool, "issue_count": int, "errors": [...], "warnings": [...]}
        Each issue has: type, ids, message, suggestion.

    Use this AFTER making changes to verify layout quality.
    If issues are found, use sb_modify to fix individual elements,
    or sb_auto_layout to recalculate all positions.
    """
    diagram = state.get()
    issues = validate_layout(diagram)
    errors = [i for i in issues if i["severity"] == "error"]
    warnings = [i for i in issues if i["severity"] == "warning"]
    return {
        "ok": len(errors) == 0,
        "issue_count": len(issues),
        "errors": errors,
        "warnings": warnings,
    }


def _label_to_id(label: str) -> str:
    """Convert a label to a valid ID: lowercase, special chars removed."""
    text = label.replace("\\n", " ")
    text = re.sub(r"[^a-zA-Z0-9\s]", "", text)
    text = re.sub(r"\s+", "_", text.strip()).lower()
    return text or "block"


def sb_fix_ids() -> str:
    """Rename auto-generated IDs based on element labels.

    Finds all blocks and groups whose ID starts with "__new_" (placeholder IDs
    created by the GUI) and renames them to a clean ID derived from the label.
    All connection references are updated automatically.

    Example: block "__new_1" with label "API Gateway" → renamed to "api_gateway".
    Duplicates are resolved by appending "_2", "_3", etc.

    Returns:
        Summary of renamed elements.
    """
    diagram = state.get()

    all_elements = [*diagram.blocks, *diagram.groups]
    targets = [e for e in all_elements if e.id.startswith("__new_")]

    if not targets:
        return "No placeholder IDs found (nothing to fix)"

    state.push_history()

    used_ids = {e.id for e in all_elements if not e.id.startswith("__new_")}
    renames: list[tuple[str, str]] = []

    for elem in targets:
        base = _label_to_id(elem.label)
        new_id = base
        if new_id in used_ids:
            n = 2
            while f"{base}_{n}" in used_ids:
                n += 1
            new_id = f"{base}_{n}"
        used_ids.add(new_id)
        renames.append((elem.id, new_id))
        elem.id = new_id

    # Update group_id references in blocks
    rename_map = dict(renames)
    for b in diagram.blocks:
        if b.group_id and b.group_id in rename_map:
            b.group_id = rename_map[b.group_id]

    # Update connection references
    for c in diagram.connections:
        if c.from_id in rename_map:
            c.from_id = rename_map[c.from_id]
        if c.to_id in rename_map:
            c.to_id = rename_map[c.to_id]

    lines = [f"  {old} → {new}" for old, new in renames]
    return f"Renamed {len(renames)} element(s):\n" + "\n".join(lines)
