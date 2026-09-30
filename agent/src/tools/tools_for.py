from __future__ import annotations

from langchain_core.tools import BaseTool

from src.config import settings
from src.tools import mcp_client
from src.tools.bank_sql import bank_tools
from src.tools.lakebase import LazyLakebasePool

_lakebase_tools: list[BaseTool] | None = None


async def tools_for(schema: str) -> list[BaseTool]:
    if settings.tools_backend == "mcp":
        return await mcp_client.tools_for(schema)
    global _lakebase_tools
    if _lakebase_tools is None:
        _lakebase_tools = bank_tools(LazyLakebasePool())
    return _lakebase_tools
