from __future__ import annotations

import asyncio
from types import SimpleNamespace

from src.config import Settings
from src.tools import mcp_client, tools_for as tools_for_module


def _backend(monkeypatch, backend):
    monkeypatch.setattr(tools_for_module, "settings", SimpleNamespace(tools_backend=backend))
    monkeypatch.setattr(tools_for_module, "_lakebase_tools", None)


def test_lakebase_is_the_default_backend(monkeypatch):
    monkeypatch.delenv("TOOLS_BACKEND", raising=False)
    assert Settings.from_env().tools_backend == "lakebase"


def test_tools_for_returns_the_lakebase_tools(monkeypatch):
    _backend(monkeypatch, "lakebase")
    tools = asyncio.run(tools_for_module.tools_for("bank_uc_consultas"))
    assert [tool.name for tool in tools] == ["get_products", "list_transactions", "get_cases"]
    assert asyncio.run(tools_for_module.tools_for("bank_uc_consultas")) is tools


def test_tools_for_returns_the_mcp_tools_with_the_mcp_backend(monkeypatch):
    _backend(monkeypatch, "mcp")
    seen = []

    async def fake_mcp_tools_for(schema):
        seen.append(schema)
        return ["mcp-tool"]

    monkeypatch.setattr(mcp_client, "tools_for", fake_mcp_tools_for)
    assert asyncio.run(tools_for_module.tools_for("bank_uc_consultas")) == ["mcp-tool"]
    assert seen == ["bank_uc_consultas"]
