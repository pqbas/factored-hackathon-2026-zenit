from __future__ import annotations

from src.graph.nodes.cancel import cancel
from src.prompts.messages import CANCEL_REPLY


def test_cancel_returns_the_fixed_reply_in_spanish():
    state = {"classification": {"language": "es"}}
    result = cancel(state)
    assert result["messages"][0].content == CANCEL_REPLY["es"]


def test_cancel_returns_the_fixed_reply_in_portuguese():
    state = {"classification": {"language": "pt"}}
    result = cancel(state)
    assert result["messages"][0].content == CANCEL_REPLY["pt"]


def test_cancel_falls_back_to_spanish_for_other():
    state = {"classification": {"language": "other"}}
    result = cancel(state)
    assert result["messages"][0].content == CANCEL_REPLY["es"]
