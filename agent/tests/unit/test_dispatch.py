from __future__ import annotations

from langgraph.graph import END

from src.graph.edges import dispatch
from src.schemas.routing import IntentRoute

ROUTES = [
    IntentRoute(intent="GENERAL_INQUIRY", description="d", examples=["e"], destination="respond"),
    IntentRoute(intent="COMPLAINT", description="d", examples=["e"], destination="respond"),
]
THRESHOLD = 0.7


def _classification(**overrides) -> dict:
    base = {
        "guardrail": "OK", "guardrail_probability": 0.0, "language": "es",
        "intent": "GENERAL_INQUIRY", "intent_confidence": 0.9, "sentiment": "neutral", "source": "jev",
    }
    return {**base, **overrides}


def test_dispatch_returns_end_for_a_blocked_turn():
    state = {
        "classification": _classification(guardrail="PROMPT_INJECTION", guardrail_probability=0.9),
    }
    assert dispatch(state, ROUTES, THRESHOLD) == END


def test_dispatch_returns_the_routes_destination_for_a_known_intent():
    state = {"classification": _classification(intent="COMPLAINT")}
    assert dispatch(state, ROUTES, THRESHOLD) == "respond"


def test_dispatch_returns_respond_for_an_unknown_intent():
    state = {"classification": _classification(intent="NOT_A_REAL_INTENT")}
    assert dispatch(state, ROUTES, THRESHOLD) == "respond"


def test_dispatch_does_not_block_below_the_threshold():
    state = {
        "classification": _classification(guardrail="PROMPT_INJECTION", guardrail_probability=0.4),
    }
    assert dispatch(state, ROUTES, THRESHOLD) == "respond"
