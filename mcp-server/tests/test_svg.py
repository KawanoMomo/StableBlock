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
