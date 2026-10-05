from __future__ import annotations

import pytest

from src.graph.nodes.paused import paused
from src.prompts.messages import HANDOFF_REPLY

USER = {"role": "user", "content": "¿ya me atienden?"}


def _state(messages, handled_by=None):
    session = {"authenticated": True, "customer_id": "CLI-TEST"}
    if handled_by is not None:
        session["handled_by"] = handled_by
    return {"messages": messages, "session": session}


def _assistant(text):
    return {"role": "assistant", "content": text}


def test_a_history_without_a_handoff_is_not_paused():
    history = [{"role": "user", "content": "hola"}, _assistant("Hola, ¿en qué te ayudo?"), USER]
    assert paused(_state(history)) == {"paused": False}


def test_a_handoff_with_nothing_after_it_is_paused():
    history = [_assistant(HANDOFF_REPLY["es"]), USER]
    assert paused(_state(history)) == {"paused": True}


def test_a_handoff_followed_by_an_advisor_message_is_not_paused():
    history = [_assistant(HANDOFF_REPLY["es"]), _assistant("[Asesor] Hola, te ayudo con tu reclamo."), USER]
    assert paused(_state(history)) == {"paused": False}


def test_the_portuguese_handoff_is_paused():
    history = [_assistant(HANDOFF_REPLY["pt"]), USER]
    assert paused(_state(history)) == {"paused": True}


def test_a_second_handoff_after_the_advisor_returned_the_chat_is_paused_again():
    history = [
        _assistant(HANDOFF_REPLY["es"]), _assistant("[Asesor] Listo."), USER,
        _assistant(HANDOFF_REPLY["es"]), USER,
    ]
    assert paused(_state(history)) == {"paused": True}


def test_handled_by_ai_agent_wins_over_the_history():
    history = [_assistant(HANDOFF_REPLY["es"]), USER]
    assert paused(_state(history, handled_by="ai_agent")) == {"paused": False}


@pytest.mark.parametrize("handled_by", ["human_queue", "human_agent"])
def test_any_other_handled_by_pauses_even_without_a_handoff_in_the_history(handled_by):
    assert paused(_state([USER], handled_by=handled_by)) == {"paused": True}


def test_langchain_messages_are_read_like_dicts():
    from langchain_core.messages import AIMessage, HumanMessage

    history = [AIMessage(content=HANDOFF_REPLY["es"]), HumanMessage(content="¿ya me atienden?")]
    assert paused(_state(history)) == {"paused": True}
