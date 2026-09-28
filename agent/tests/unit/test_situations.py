from __future__ import annotations

from src.prompts.situations import situation_for

THRESHOLD = 0.5


def _classification(**overrides) -> dict:
    base = {"intent": "GREETING", "intent_confidence": 0.9}
    return {**base, **overrides}


def test_situation_for_returns_clarify_below_the_threshold_even_for_greeting():
    classification = _classification(intent="GREETING", intent_confidence=0.2)
    assert situation_for(classification, THRESHOLD) == "clarify"


def test_situation_for_returns_greeting():
    assert situation_for(_classification(intent="GREETING"), THRESHOLD) == "greeting"


def test_situation_for_returns_goodbye():
    assert situation_for(_classification(intent="GOODBYE"), THRESHOLD) == "goodbye"


def test_situation_for_returns_out_of_scope():
    assert situation_for(_classification(intent="OUT_OF_SCOPE"), THRESHOLD) == "out_of_scope"


def test_situation_for_returns_unavailable_for_general_inquiry_and_human_agent():
    assert situation_for(_classification(intent="GENERAL_INQUIRY"), THRESHOLD) == "unavailable"
    assert situation_for(_classification(intent="HUMAN_AGENT"), THRESHOLD) == "unavailable"
