"""Integration tests for the gate -> respond graph, with a fake LLM and MemorySaver."""

from __future__ import annotations

import asyncio

from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage
from langgraph.checkpoint.memory import MemorySaver

from src.graph.build import build_graph
from src.prompts.messages import SESSION_REJECTED

VALID_SESSION = {"authenticated": True, "customer_id": "CLI-TEST", "reason": None}
EXPIRED_SESSION = {"authenticated": False, "customer_id": None, "reason": "expired"}


class ExplodingLLM:
    """A chat model stand-in that fails the test if the graph ever calls it."""

    async def ainvoke(self, messages):
        raise AssertionError("the LLM must not be called for a rejected session")


def test_invalid_session_gets_fixed_reply_without_calling_the_llm():
    graph = build_graph(ExplodingLLM(), MemorySaver())
    config = {"configurable": {"thread_id": "invalid-session-thread"}}

    result = asyncio.run(graph.ainvoke(
        {"messages": [{"role": "user", "content": "hola"}], "session": EXPIRED_SESSION, "thread_id": "t"},
        config,
    ))

    assert result["messages"][-1].content == SESSION_REJECTED["expired"]


def test_valid_session_gets_the_llm_reply():
    llm = GenericFakeChatModel(messages=iter([AIMessage(content="Hola, ¿en qué te ayudo?")]))
    graph = build_graph(llm, MemorySaver())
    config = {"configurable": {"thread_id": "valid-session-thread"}}

    result = asyncio.run(graph.ainvoke(
        {"messages": [{"role": "user", "content": "hola"}], "session": VALID_SESSION, "thread_id": "t"},
        config,
    ))

    assert result["messages"][-1].content == "Hola, ¿en qué te ayudo?"


def test_history_is_kept_across_two_turns_on_the_same_thread():
    llm = GenericFakeChatModel(
        messages=iter([AIMessage(content="primera respuesta"), AIMessage(content="segunda respuesta")])
    )
    graph = build_graph(llm, MemorySaver())
    config = {"configurable": {"thread_id": "two-turn-thread"}}

    asyncio.run(graph.ainvoke(
        {"messages": [{"role": "user", "content": "hola"}], "session": VALID_SESSION, "thread_id": "t"},
        config,
    ))
    result = asyncio.run(graph.ainvoke(
        {"messages": [{"role": "user", "content": "¿qué te dije antes?"}], "session": VALID_SESSION, "thread_id": "t"},
        config,
    ))

    # the second turn's state carries the first turn's messages, so the second LLM
    # call (which receives state["messages"] in full) saw the first message too.
    contents = [m.content for m in result["messages"]]
    assert contents == ["hola", "primera respuesta", "¿qué te dije antes?", "segunda respuesta"]
