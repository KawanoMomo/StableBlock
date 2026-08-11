"""Tests for auto-layout algorithms."""

from stableblock_mcp.core.layout import auto_layout, place_block_in_group, place_new_group
from stableblock_mcp.models.types import Block, CanvasSettings, Diagram, Group


def test_place_new_group_first():
    d = Diagram()
    g = Group(id="g1", label="G1", x=0, y=0, w=0, h=0)
    d.groups.append(g)
    place_new_group(d, g)
    assert g.x == 1
    assert g.y == 1
    assert g.w > 0
    assert g.h == 6


def test_place_new_group_stacks():
    d = Diagram()
    g1 = Group(id="g1", label="G1", x=1, y=1, w=46, h=6)
    d.groups.append(g1)
    g2 = Group(id="g2", label="G2", x=0, y=0, w=0, h=0)
    d.groups.append(g2)
    place_new_group(d, g2)
    assert g2.y == g1.y + g1.h + 1  # below g1 with gap


def test_place_block_in_group():
    d = Diagram()
    g = Group(id="g1", label="G1", x=1, y=1, w=46, h=6)
    d.groups.append(g)
    b = Block(id="b1", label="B1", x=0, y=0, w=0, h=0, group_id="g1")
    d.blocks.append(b)
    place_block_in_group(d, b, g)
    assert b.x == g.x + 1  # padding
    assert b.y == g.y + 2  # label space
    assert b.w == 9
    assert b.h == 3


def test_place_second_block_in_group():
    d = Diagram()
    g = Group(id="g1", label="G1", x=1, y=1, w=46, h=6)
    d.groups.append(g)
    b1 = Block(id="b1", label="B1", x=2, y=3, w=9, h=3, group_id="g1")
    d.blocks.append(b1)
    b2 = Block(id="b2", label="B2", x=0, y=0, w=0, h=0, group_id="g1")
    d.blocks.append(b2)
    place_block_in_group(d, b2, g)
    assert b2.x > b1.x  # placed to the right


def test_auto_layout_positions_groups_and_blocks():
    d = Diagram(canvas=CanvasSettings(width=960, height=640, grid=20))
    g1 = Group(id="g1", label="App", x=0, y=0, w=0, h=0)
    g2 = Group(id="g2", label="MW", x=0, y=0, w=0, h=0)
    d.groups = [g1, g2]
    b1 = Block(id="ui", label="UI", x=0, y=0, w=0, h=0, group_id="g1")
    b2 = Block(id="comm", label="Comm", x=0, y=0, w=0, h=0, group_id="g2")
    d.blocks = [b1, b2]

    auto_layout(d)

    # g1 should be above g2
    assert g1.y < g2.y
    # Blocks should be inside their groups
    assert g1.x <= b1.x <= g1.x + g1.w
    assert g2.x <= b2.x <= g2.x + g2.w
