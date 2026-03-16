"""Tests for MCP tool functions."""

import json
import tempfile
from pathlib import Path

from stableblock_mcp import state
from stableblock_mcp.tools.diagram import sb_new, sb_open, sb_resize_canvas, sb_save, sb_show, sb_undo
from stableblock_mcp.tools.elements import (
    sb_add_block,
    sb_add_group,
    sb_connect,
    sb_modify,
    sb_move_to_group,
    sb_remove,
)
from stableblock_mcp.tools.export import sb_export_svg
from stableblock_mcp.tools.smart import sb_auto_layout, sb_from_template, sb_validate_layout


def setup_function():
    state.clear()


def test_sb_new():
    result = sb_new(800, 600, 10)
    assert "800x600" in result
    assert state.has_diagram()


def test_sb_show_after_new():
    sb_new()
    result = sb_show()
    assert result["block_count"] == 0
    assert result["group_count"] == 0


def test_sb_add_group_and_block():
    sb_new()
    result = sb_add_group("app", "Application", color_theme="blue")
    assert "app" in result

    result = sb_add_block("ui", "UI", group_id="app")
    assert "ui" in result

    show = sb_show()
    assert show["block_count"] == 1
    assert show["group_count"] == 1
    assert "ui" in show["groups"][0]["blocks"]


def test_sb_connect():
    sb_new()
    sb_add_block("a", "A")
    sb_add_block("b", "B")
    result = sb_connect("a", "b", label="flow")
    assert "a" in result and "b" in result

    show = sb_show()
    assert show["connection_count"] == 1
    assert show["connections"][0]["label"] == "flow"


def test_sb_connect_unknown_block():
    sb_new()
    sb_add_block("a", "A")
    result = sb_connect("a", "nonexistent")
    assert "Error" in result


def test_sb_remove_block():
    sb_new()
    sb_add_block("a", "A")
    sb_add_block("b", "B")
    sb_connect("a", "b")
    result = sb_remove("a")
    assert "block" in result
    assert "connection" in result

    show = sb_show()
    assert show["block_count"] == 1
    assert show["connection_count"] == 0


def test_sb_remove_group():
    sb_new()
    sb_add_group("g1", "G1")
    sb_add_block("b1", "B1", group_id="g1")
    result = sb_remove("g1")
    assert "group" in result

    show = sb_show()
    assert show["group_count"] == 0
    assert show["block_count"] == 1  # block kept
    assert "b1" in show["ungrouped_blocks"]


def test_sb_modify():
    sb_new()
    sb_add_block("a", "A")
    result = sb_modify("a", label="New Label", color="#FF0000")
    assert "label='New Label'" in result
    assert "color=#FF0000" in result


def test_sb_from_template():
    result = sb_from_template("layered", {
        "layers": [
            {"label": "App", "blocks": ["UI", "Logic"]},
        ],
    })
    assert result["block_count"] == 2
    assert result["group_count"] == 1


def test_sb_auto_layout():
    sb_new()
    sb_add_group("g1", "G1", color_theme="blue")
    sb_add_block("a", "A", group_id="g1")
    sb_add_block("b", "B", group_id="g1")
    result = sb_auto_layout()
    assert result["block_count"] == 2


def test_sb_save_and_open():
    sb_new()
    sb_add_group("app", "Application", color_theme="blue")
    sb_add_block("ui", "UI", group_id="app")
    sb_add_block("logic", "Logic", group_id="app")
    sb_connect("ui", "logic")

    with tempfile.NamedTemporaryFile(suffix=".sb", delete=False, mode="w") as f:
        path = f.name

    sb_save(path)
    assert Path(path).exists()
    content = Path(path).read_text()
    assert "Application" in content
    assert "ui" in content

    # Reload
    state.clear()
    result = sb_open(path)
    assert "2 blocks" in result
    show = sb_show()
    assert show["block_count"] == 2

    Path(path).unlink()


def test_sb_export_svg():
    sb_from_template("pipeline", {"stages": ["A", "B", "C"]})

    with tempfile.NamedTemporaryFile(suffix=".svg", delete=False, mode="w") as f:
        path = f.name

    result = sb_export_svg(path)
    assert "Exported" in result
    content = Path(path).read_text()
    assert "<svg" in content
    assert ">A<" in content

    Path(path).unlink()


def test_sb_duplicate_block_id():
    sb_new()
    sb_add_block("a", "A")
    result = sb_add_block("a", "Another A")
    assert "Error" in result


def test_sb_duplicate_group_id():
    sb_new()
    sb_add_group("g", "G")
    result = sb_add_group("g", "G2")
    assert "Error" in result


def test_sb_show_detail():
    sb_new()
    sb_add_group("app", "Application", color_theme="blue")
    sb_add_block("ui", "UI", group_id="app")
    result = sb_show(detail=True)
    assert result["block_count"] == 1
    grp = result["groups"][0]
    assert "x" in grp and "y" in grp and "w" in grp and "h" in grp
    blk = grp["blocks"][0]
    assert "x" in blk and "color" in blk and blk["id"] == "ui"


def test_sb_undo():
    sb_new()
    sb_add_block("a", "A")
    assert sb_show()["block_count"] == 1
    result = sb_undo()
    assert "Undone" in result
    assert sb_show()["block_count"] == 0


def test_sb_undo_empty():
    sb_new()
    result = sb_undo()
    assert "Nothing" in result


def test_sb_resize_canvas():
    sb_new()
    result = sb_resize_canvas(width=1200, height=800)
    assert "1200x800" in result
    detail = sb_show(detail=True)
    assert detail["canvas"] == "1200x800"


def test_sb_modify_position():
    sb_new()
    sb_add_block("a", "A")
    result = sb_modify("a", x=10, y=5, w=12, h=4)
    assert "x=10" in result and "w=12" in result
    d = state.get()
    blk = d.blocks[0]
    assert blk.x == 10 and blk.y == 5 and blk.w == 12 and blk.h == 4


def test_sb_move_to_group():
    sb_new()
    sb_add_group("g1", "Group 1")
    sb_add_block("a", "A")
    assert sb_show()["ungrouped_blocks"] == ["a"]
    result = sb_move_to_group("a", "g1")
    assert "g1" in result
    assert sb_show()["groups"][0]["blocks"] == ["a"]


def test_sb_move_to_group_ungroup():
    sb_new()
    sb_add_group("g1", "Group 1")
    sb_add_block("a", "A", group_id="g1")
    result = sb_move_to_group("a", None)
    assert "Ungrouped" in result
    assert sb_show()["ungrouped_blocks"] == ["a"]


def test_sb_validate_clean():
    sb_from_template("layered", {
        "layers": [{"label": "App", "blocks": ["UI", "Logic"]}],
    })
    result = sb_validate_layout()
    assert result["ok"] is True
    assert result["issue_count"] == 0


def test_e2e_full_workflow():
    """Full E2E: new -> add groups -> add blocks -> connect -> save -> reopen."""
    sb_new()

    sb_add_group("app", "Application", color_theme="blue")
    sb_add_group("mw", "Middleware", color_theme="amber")

    sb_add_block("ui", "UI", group_id="app")
    sb_add_block("logic", "Logic", group_id="app")
    sb_add_block("comm", "Comm", group_id="mw")
    sb_add_block("diag", "Diag", group_id="mw")

    sb_connect("ui", "comm")
    sb_connect("logic", "diag")

    show = sb_show()
    assert show["block_count"] == 4
    assert show["group_count"] == 2
    assert show["connection_count"] == 2

    with tempfile.NamedTemporaryFile(suffix=".sb", delete=False, mode="w") as f:
        path = f.name

    sb_save(path)
    content = Path(path).read_text()
    assert "Application" in content
    assert "Middleware" in content
    assert "ui -> comm" in content

    # Reopen and verify
    state.clear()
    sb_open(path)
    show2 = sb_show()
    assert show2["block_count"] == 4
    assert show2["connection_count"] == 2

    Path(path).unlink()
