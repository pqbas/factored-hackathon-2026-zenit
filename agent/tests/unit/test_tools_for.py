from __future__ import annotations

import asyncio

from src.tools import tools_for as tools_for_module


def test_tools_for_returns_the_lakebase_tools(monkeypatch):
    monkeypatch.setattr(tools_for_module, "_lakebase_tools", None)
    tools = asyncio.run(tools_for_module.tools_for("bank_uc_consultas"))
    assert [tool.name for tool in tools] == ["get_products", "list_transactions", "get_cases"]
    assert asyncio.run(tools_for_module.tools_for("bank_uc_consultas")) is tools


def test_there_is_no_mcp_path():
    import importlib.util

    assert importlib.util.find_spec("src.tools.mcp_client") is None
    assert not hasattr(tools_for_module, "mcp_client")
