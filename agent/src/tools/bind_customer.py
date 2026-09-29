from __future__ import annotations

from typing import Any

from langchain_core.tools import BaseTool, StructuredTool

_CUSTOMER_ID = "customer_id"


def bind_customer(tool: BaseTool, customer_id: str, fail: bool = False) -> BaseTool:
    schema = dict(tool.args_schema)
    schema["properties"] = {
        name: value for name, value in schema.get("properties", {}).items() if name != _CUSTOMER_ID
    }
    schema["required"] = [name for name in schema.get("required", []) if name != _CUSTOMER_ID]

    async def call(**kwargs: Any) -> Any:
        # Whatever the LLM sends for customer_id is discarded; only the session's counts.
        kwargs.pop(_CUSTOMER_ID, None)
        if fail:
            # What a warehouse that doesn't answer raises, without calling the tool.
            raise TimeoutError("The SQL warehouse didn't answer")
        return await tool.ainvoke({**kwargs, _CUSTOMER_ID: customer_id})

    return StructuredTool.from_function(
        coroutine=call,
        name=tool.name,
        description=tool.description,
        args_schema=schema,
        infer_schema=False,
    )
