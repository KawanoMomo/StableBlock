"""Pydantic data models for StableBlock diagrams."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class CanvasSettings(BaseModel):
    width: int = 960
    height: int = 640
    grid: int = 20


class Block(BaseModel):
    id: str
    label: str
    x: float
    y: float
    w: float
    h: float
    color: str = "#3B82F6"
    text_color: str = "#FFFFFF"
    border_color: str | None = None
    round: int = 4
    style: Literal["solid", "dashed", "bold"] = "solid"
    group_id: str | None = None


class Group(BaseModel):
    id: str
    label: str
    x: float
    y: float
    w: float
    h: float
    color: str = "#F3F4F6"
    border_color: str = "#9CA3AF"


class Connection(BaseModel):
    from_id: str
    to_id: str
    label: str = ""
    color: str = "#64748B"
    style: Literal["solid", "dashed"] = "solid"
    bidirectional: bool = False


class Diagram(BaseModel):
    canvas: CanvasSettings = CanvasSettings()
    blocks: list[Block] = []
    groups: list[Group] = []
    connections: list[Connection] = []


class BlockDetail(BaseModel):
    id: str
    label: str
    x: float
    y: float
    w: float
    h: float
    color: str
    text_color: str
    style: str
    group_id: str | None


class GroupDetail(BaseModel):
    id: str
    label: str
    x: float
    y: float
    w: float
    h: float
    color: str
    border_color: str
    blocks: list[BlockDetail]


class GroupSummary(BaseModel):
    id: str
    label: str
    blocks: list[str]


class ConnectionSummary(BaseModel):
    from_id: str
    to_id: str
    label: str
    bidirectional: bool


class DiagramSummary(BaseModel):
    block_count: int
    group_count: int
    connection_count: int
    canvas: str
    groups: list[GroupSummary]
    ungrouped_blocks: list[str]
    connections: list[ConnectionSummary]


class DiagramDetail(BaseModel):
    """Detailed view with positions, sizes, and colors."""
    block_count: int
    group_count: int
    connection_count: int
    canvas: str
    groups: list[GroupDetail]
    ungrouped_blocks: list[BlockDetail]
    connections: list[ConnectionSummary]
