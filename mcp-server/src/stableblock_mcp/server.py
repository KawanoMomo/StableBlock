"""Entry point for the StableBlock MCP server."""

from stableblock_mcp.app import mcp


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
