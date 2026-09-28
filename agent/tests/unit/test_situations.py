from __future__ import annotations

import pytest

from src.prompts.situations import situation_for

THRESHOLD = 0.5


def _classification(**overrides) -> dict:
    base = {"intent": "GREETING", "intent_confidence": 0.9}
    return {**base, **overrides}


def test_situation_for_returns_clarify_below_the_threshold_even_for_greeting():
    classification = _classification(intent="GREETING", intent_confidence=0.2)
    assert situation_for(classification, THRESHOLD) == "clarify"


@pytest.mark.parametrize(
    "intent, situation",
    [
        ("GREETING", "greeting"),
        ("GOODBYE", "goodbye"),
        ("OUT_OF_SCOPE", "out_of_scope"),
        ("GENERAL_INQUIRY", "unavailable"),
        ("HUMAN_AGENT", "unavailable"),
    ],
)
def test_situation_for_maps_the_intent_to_its_situation(intent, situation):
    assert situation_for(_classification(intent=intent), THRESHOLD) == situation
