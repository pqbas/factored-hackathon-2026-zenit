from __future__ import annotations

import asyncio

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from src.llm.usage import TurnUsage


class UsageChatModel(BaseChatModel):
    """Reports usage on every call; model_name is left out of response_metadata on purpose."""

    usage: dict | None = {"input_tokens": 10, "output_tokens": 3, "total_tokens": 13}

    @property
    def _llm_type(self) -> str:
        return "usage-fake"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        message = AIMessage(content="ok", usage_metadata=self.usage)
        return ChatResult(generations=[ChatGeneration(message=message)])


def _run(llm, handler, calls=1):
    async def go():
        for _ in range(calls):
            await llm.ainvoke("hi", config={"callbacks": [handler]})

    asyncio.run(go())


def test_no_llm_call_is_zero_tokens():
    assert TurnUsage().totals() == {"input_tokens": 0, "output_tokens": 0}


def test_the_calls_of_a_turn_are_summed():
    handler = TurnUsage()
    _run(UsageChatModel(), handler, calls=3)
    assert handler.totals() == {"input_tokens": 30, "output_tokens": 9}


def test_an_llm_that_reports_nothing_is_null():
    handler = TurnUsage()
    _run(UsageChatModel(usage=None), handler, calls=2)
    assert handler.totals() is None
