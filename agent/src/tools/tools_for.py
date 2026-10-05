from __future__ import annotations

from langchain_core.tools import BaseTool

from src.tools.bank_sql import bank_tools
from src.tools.lakebase import LazyLakebasePool

_lakebase_tools: list[BaseTool] | None = None


async def tools_for(schema: str) -> list[BaseTool]:
    # Lakebase only: the managed MCP path (UC functions on serverless) is off for good, so a
    # Lakebase failure ends in the tool-failure reply, never in MCP.
    global _lakebase_tools
    if _lakebase_tools is None:
        _lakebase_tools = bank_tools(LazyLakebasePool())
    return _lakebase_tools
