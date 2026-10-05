from __future__ import annotations

from langchain_core.tools import BaseTool

from src.config import settings
from src.tools.bank_sql import bank_tools
from src.tools.lakebase import LazyLakebasePool

_lakebase_tools: list[BaseTool] | None = None


async def tools_for(schema: str) -> list[BaseTool]:
    # Lakebase is the default. The warehouse path is an explicit local setting;
    # there is no automatic MCP fallback after a read failure.
    global _lakebase_tools
    if _lakebase_tools is None:
        if settings.bank_read_source == "databricks":
            from src.tools.databricks_bank import DatabricksBankPool

            pool = DatabricksBankPool()
        elif settings.bank_read_source == "lakebase":
            pool = LazyLakebasePool()
        else:
            raise ValueError("BANK_READ_SOURCE must be lakebase or databricks")
        _lakebase_tools = bank_tools(pool)
    return _lakebase_tools
