from __future__ import annotations

import asyncio

from langchain_core.tools import StructuredTool

from src.tools.bind_customer import bind_customer

_SCHEMA = {
    "type": "object",
    "properties": {"customer_id": {"type": "string"}, "product_last4": {"type": "string"}},
    "required": ["customer_id"],
}


def _fake_tool(calls: list[dict]) -> StructuredTool:
    async def call(**kwargs):
        calls.append(kwargs)
        return "ok"

    return StructuredTool.from_function(
        coroutine=call, name="get_products", description="d", args_schema=_SCHEMA, infer_schema=False,
    )


def test_bind_customer_hides_customer_id_from_the_schema():
    bound = bind_customer(_fake_tool([]), "CLI-TEST")
    assert "customer_id" not in bound.args_schema["properties"]
    assert "customer_id" not in bound.args_schema["required"]
    assert "product_last4" in bound.args_schema["properties"]


def test_bind_customer_sends_the_sessions_customer_id_when_the_call_brings_none():
    calls: list[dict] = []
    bound = bind_customer(_fake_tool(calls), "CLI-TEST")
    asyncio.run(bound.ainvoke({"product_last4": "1234"}))
    assert calls == [{"product_last4": "1234", "customer_id": "CLI-TEST"}]


def test_bind_customer_sends_the_sessions_customer_id_even_when_the_call_brings_another():
    calls: list[dict] = []
    bound = bind_customer(_fake_tool(calls), "CLI-TEST")
    asyncio.run(bound.ainvoke({"product_last4": "1234", "customer_id": "CLI-OTHER"}))
    assert calls == [{"product_last4": "1234", "customer_id": "CLI-TEST"}]
