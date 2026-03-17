"""Tests for SVG renderer."""

from stableblock_mcp.core.svg import render_svg
from stableblock_mcp.core.templates import apply_template


def test_svg_is_valid_xml():
    """Generated SVG should be parseable XML."""
    import xml.etree.ElementTree as ET

    data = {
        "layers": [
            {"label": "App", "blocks": ["UI", "Logic"]},
            {"label": "MW", "blocks": ["Comm"]},
        ],
        "connect_adjacent": True,
    }
    d = apply_template("layered", data)
    svg = render_svg(d)

    # Should parse without error
    root = ET.fromstring(svg)
    assert root.tag == "{http://www.w3.org/2000/svg}svg"


def test_svg_contains_blocks():
    data = {"stages": ["A", "B"]}
    d = apply_template("pipeline", data)
    svg = render_svg(d)
    assert ">A<" in svg
    assert ">B<" in svg


def test_svg_empty_diagram():
    from stableblock_mcp.models.types import Diagram
    svg = render_svg(Diagram())
    assert "<svg" in svg
    assert "</svg>" in svg


def test_svg_escapes_html():
    from stableblock_mcp.models.types import Block, Diagram
    d = Diagram(blocks=[
        Block(id="x", label='<script>alert("xss")</script>', x=1, y=1, w=5, h=3),
    ])
    svg = render_svg(d)
    assert "<script>" not in svg
    assert "&lt;script&gt;" in svg


def test_svg_edge_gap_side_selection():
    """Edge-gap algorithm: blocks stacked vertically should connect bottom->top."""
    from stableblock_mcp.core.svg import _get_side
    from stableblock_mcp.models.types import Block

    # mobile at (14,3) 10x3, gw at (2,10) 12x3 — vertically separated
    mobile = Block(id="m", label="M", x=14, y=3, w=10, h=3)
    gw = Block(id="g", label="G", x=2, y=10, w=12, h=3)
    side = _get_side(mobile, gw)
    assert side["fs"] == "bottom"
    assert side["ts"] == "top"


def test_svg_port_distribution():
    """Multiple connections on same side should produce different port positions."""
    from stableblock_mcp.core.svg import _compute_ports
    from stableblock_mcp.models.types import Block, Connection

    a = Block(id="a", label="A", x=1, y=1, w=8, h=3)
    b = Block(id="b", label="B", x=1, y=10, w=8, h=3)
    c = Block(id="c", label="C", x=12, y=10, w=8, h=3)
    bm = {"a": a, "b": b, "c": c}
    conns = [
        Connection(from_id="a", to_id="b"),
        Connection(from_id="a", to_id="c"),
    ]
    ports = _compute_ports(conns, bm, 20)
    assert ports[0] is not None
    assert ports[1] is not None
    # Two connections from 'a' bottom — should have different x positions
    assert ports[0]["fp"]["x"] != ports[1]["fp"]["x"]
