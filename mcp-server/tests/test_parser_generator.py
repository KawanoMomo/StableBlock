"""Tests for parser <-> generator round-trip and individual parsing."""

from stableblock_mcp.core.generator import generate_dsl
from stableblock_mcp.core.parser import parse_dsl


SAMPLE_DSL = """\
# StableBlock v0.4
@canvas width=960 height=520 grid=20

# Application
group app "Application" at 1,1 size 46x6 color=#EEF2FF border=#818CF8

block ui "UI" at 2,3 size 9x3 color=#6366F1 text=#FFFFFF round=6
block logic "Logic" at 13,3 size 9x3 color=#6366F1 text=#FFFFFF round=6

# Connections
ui -> logic
logic --> ui "data" color=#EF4444 style=dashed
"""


def test_parse_canvas():
    d = parse_dsl(SAMPLE_DSL)
    assert d.canvas.width == 960
    assert d.canvas.height == 520
    assert d.canvas.grid == 20


def test_parse_blocks():
    d = parse_dsl(SAMPLE_DSL)
    assert len(d.blocks) == 2
    b = d.blocks[0]
    assert b.id == "ui"
    assert b.label == "UI"
    assert b.x == 2 and b.y == 3
    assert b.w == 9 and b.h == 3
    assert b.color == "#6366F1"
    assert b.text_color == "#FFFFFF"
    assert b.round == 6


def test_parse_group():
    d = parse_dsl(SAMPLE_DSL)
    assert len(d.groups) == 1
    g = d.groups[0]
    assert g.id == "app"
    assert g.label == "Application"
    assert g.color == "#EEF2FF"
    assert g.border_color == "#818CF8"


def test_parse_connections():
    d = parse_dsl(SAMPLE_DSL)
    assert len(d.connections) == 2
    c1 = d.connections[0]
    assert c1.from_id == "ui" and c1.to_id == "logic"
    assert c1.bidirectional is False
    c2 = d.connections[1]
    assert c2.from_id == "logic" and c2.to_id == "ui"
    assert c2.bidirectional is True
    assert c2.label == "data"
    assert c2.color == "#EF4444"
    assert c2.style == "dashed"


def test_round_trip():
    """Parse DSL, generate DSL, parse again — structure should match."""
    d1 = parse_dsl(SAMPLE_DSL)
    generated = generate_dsl(d1)
    d2 = parse_dsl(generated)

    assert d2.canvas.width == d1.canvas.width
    assert d2.canvas.height == d1.canvas.height
    assert len(d2.blocks) == len(d1.blocks)
    assert len(d2.groups) == len(d1.groups)
    assert len(d2.connections) == len(d1.connections)

    for b1, b2 in zip(d1.blocks, d2.blocks):
        assert b1.id == b2.id
        assert b1.label == b2.label
        assert b1.color == b2.color

    for c1, c2 in zip(d1.connections, d2.connections):
        assert c1.from_id == c2.from_id
        assert c1.to_id == c2.to_id
        assert c1.bidirectional == c2.bidirectional


def test_parse_empty():
    d = parse_dsl("")
    assert len(d.blocks) == 0
    assert len(d.groups) == 0
    assert len(d.connections) == 0


def test_parse_comments_ignored():
    d = parse_dsl("# just a comment\n# another one\n")
    assert len(d.blocks) == 0


def test_parse_default_canvas():
    d = parse_dsl('block a "A" at 0,0 size 5x3')
    assert d.canvas.width == 960
    assert d.canvas.height == 640
    assert d.canvas.grid == 20
