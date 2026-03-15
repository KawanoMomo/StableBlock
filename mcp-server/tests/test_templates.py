"""Tests for template system."""

from stableblock_mcp.core.templates import apply_template


def test_layered_template():
    data = {
        "layers": [
            {"label": "App", "blocks": ["UI", "Logic"]},
            {"label": "MW", "blocks": ["Comm"]},
        ],
        "connect_adjacent": True,
    }
    d = apply_template("layered", data)
    assert len(d.groups) == 2
    assert len(d.blocks) == 3
    # connect_adjacent should create connections
    assert len(d.connections) >= 1
    # Groups should have different y positions (stacked)
    assert d.groups[0].y < d.groups[1].y


def test_layered_with_color_theme():
    data = {
        "layers": [
            {"label": "App", "blocks": ["UI"], "color_theme": "red"},
        ],
    }
    d = apply_template("layered", data)
    assert d.groups[0].color == "#FEE2E2"  # red group color
    assert d.blocks[0].color == "#DC2626"  # red block color


def test_pipeline_horizontal():
    data = {"stages": ["A", "B", "C"], "direction": "horizontal"}
    d = apply_template("pipeline", data)
    assert len(d.blocks) == 3
    assert len(d.connections) == 2  # A->B, B->C
    # Blocks should be left to right
    assert d.blocks[0].x < d.blocks[1].x < d.blocks[2].x


def test_pipeline_vertical():
    data = {"stages": ["A", "B"], "direction": "vertical"}
    d = apply_template("pipeline", data)
    assert d.blocks[0].y < d.blocks[1].y


def test_grid_template():
    data = {"rows": [["A", "B"], ["C", "D"]]}
    d = apply_template("grid", data)
    assert len(d.blocks) == 4
    # Row 1 blocks should have same y, different x
    assert d.blocks[0].y == d.blocks[1].y
    assert d.blocks[0].x < d.blocks[1].x
    # Row 2 should be below row 1
    assert d.blocks[2].y > d.blocks[0].y


def test_unknown_template_raises():
    try:
        apply_template("nonexistent", {})
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "nonexistent" in str(e)
