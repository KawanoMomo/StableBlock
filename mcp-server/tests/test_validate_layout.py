"""Tests for layout validation."""

from stableblock_mcp.core.validate_layout import validate_layout
from stableblock_mcp.models.types import Block, CanvasSettings, Connection, Diagram, Group


def _make_diagram(**kw) -> Diagram:
    return Diagram(canvas=CanvasSettings(width=960, height=640, grid=20), **kw)


def test_no_issues_clean_diagram():
    d = _make_diagram(
        groups=[Group(id="g1", label="App", x=1, y=1, w=46, h=6)],
        blocks=[
            Block(id="b1", label="UI", x=2, y=3, w=9, h=3, group_id="g1"),
            Block(id="b2", label="Logic", x=13, y=3, w=9, h=3, group_id="g1"),
        ],
    )
    issues = validate_layout(d)
    assert issues == []


def test_block_overlap():
    d = _make_diagram(
        blocks=[
            Block(id="a", label="A", x=5, y=5, w=8, h=3),
            Block(id="b", label="B", x=10, y=5, w=8, h=3),  # overlaps with a
        ],
    )
    issues = validate_layout(d)
    overlap_issues = [i for i in issues if i["type"] == "block_overlap"]
    assert len(overlap_issues) == 1
    assert set(overlap_issues[0]["ids"]) == {"a", "b"}


def test_no_overlap_adjacent_blocks():
    d = _make_diagram(
        blocks=[
            Block(id="a", label="A", x=5, y=5, w=8, h=3),
            Block(id="b", label="B", x=13, y=5, w=8, h=3),  # touching, not overlapping
        ],
    )
    issues = validate_layout(d)
    overlap_issues = [i for i in issues if i["type"] == "block_overlap"]
    assert len(overlap_issues) == 0


def test_group_overlap():
    d = _make_diagram(
        groups=[
            Group(id="g1", label="A", x=1, y=1, w=20, h=6),
            Group(id="g2", label="B", x=10, y=3, w=20, h=6),  # overlaps g1
        ],
    )
    issues = validate_layout(d)
    overlap_issues = [i for i in issues if i["type"] == "group_overlap"]
    assert len(overlap_issues) == 1


def test_nested_groups_no_overlap():
    d = _make_diagram(
        groups=[
            Group(id="outer", label="Outer", x=1, y=1, w=40, h=20),
            Group(id="inner", label="Inner", x=2, y=3, w=20, h=6),  # inside outer
        ],
    )
    issues = validate_layout(d)
    overlap_issues = [i for i in issues if i["type"] == "group_overlap"]
    assert len(overlap_issues) == 0


def test_block_outside_group():
    d = _make_diagram(
        groups=[Group(id="g1", label="App", x=1, y=1, w=20, h=6)],
        blocks=[
            Block(id="b1", label="OK", x=2, y=3, w=9, h=3, group_id="g1"),
            Block(id="b2", label="Out", x=25, y=3, w=9, h=3, group_id="g1"),  # outside
        ],
    )
    issues = validate_layout(d)
    outside_issues = [i for i in issues if i["type"] == "block_outside_group"]
    assert len(outside_issues) == 1
    assert "b2" in outside_issues[0]["ids"]


def test_outside_canvas():
    d = _make_diagram(
        blocks=[Block(id="b1", label="Far", x=50, y=35, w=9, h=3)],
    )
    # canvas is 960x640 with grid=20 → 48x32 grid units
    issues = validate_layout(d)
    canvas_issues = [i for i in issues if i["type"] == "outside_canvas"]
    assert len(canvas_issues) >= 1


def test_text_overflow_wide():
    d = _make_diagram(
        blocks=[Block(id="b1", label="Very Long Label Text Here", x=5, y=5, w=4, h=3)],
    )
    issues = validate_layout(d)
    overflow_issues = [i for i in issues if i["type"] == "text_overflow"]
    assert len(overflow_issues) >= 1
    assert "b1" in overflow_issues[0]["ids"]


def test_text_overflow_tall():
    d = _make_diagram(
        blocks=[Block(id="b1", label="Line1\\nLine2\\nLine3\\nLine4", x=5, y=5, w=9, h=2)],
    )
    issues = validate_layout(d)
    overflow_issues = [i for i in issues if i["type"] == "text_overflow"]
    assert any("b1" in i["ids"] for i in overflow_issues)


def test_group_label_overflow():
    d = _make_diagram(
        groups=[Group(id="g1", label="Extremely Long Group Label Name Here", x=1, y=1, w=5, h=6)],
    )
    issues = validate_layout(d)
    overflow_issues = [i for i in issues if i["type"] == "text_overflow"]
    assert len(overflow_issues) >= 1
