from __future__ import annotations

from langgraph.graph import END

from src.graph.edges import dispatch
from src.schemas.routing import IntentRoute

ROUTES = [
    IntentRoute(
        intent="GENERAL_INQUIRY", description="d", examples=["e"], destination="load_context",
        schemas=["bank_uc_consultas"], instructions="usa get_products",
    ),
    IntentRoute(intent="COMPLAINT", description="d", examples=["e"], destination="respond"),
    IntentRoute(intent="CANCEL", description="d", examples=["e"], destination="cancel"),
]
THRESHOLD = 0.7
INTENT_THRESHOLD = 0.5


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
    assert dispatch(state, ROUTES, THRESHOLD, INTENT_THRESHOLD) == END


def test_dispatch_returns_the_routes_destination_for_a_known_intent():
    state = {"classification": _classification(intent="COMPLAINT")}
    assert dispatch(state, ROUTES, THRESHOLD, INTENT_THRESHOLD) == "respond"


def test_dispatch_returns_respond_for_an_unknown_intent():
    state = {"classification": _classification(intent="NOT_A_REAL_INTENT")}
    assert dispatch(state, ROUTES, THRESHOLD, INTENT_THRESHOLD) == "respond"


def test_dispatch_does_not_block_below_the_threshold():
    state = {
        "classification": _classification(
            intent="COMPLAINT", guardrail="PROMPT_INJECTION", guardrail_probability=0.4
        ),
    }
    assert dispatch(state, ROUTES, THRESHOLD, INTENT_THRESHOLD) == "respond"


def test_dispatch_sends_cancel_to_cancel_even_with_low_confidence():
    state = {"classification": _classification(intent="CANCEL", intent_confidence=0.1)}
    assert dispatch(state, ROUTES, THRESHOLD, INTENT_THRESHOLD) == "cancel"


def test_dispatch_sends_low_confidence_to_respond_instead_of_the_intents_route():
    state = {"classification": _classification(intent="COMPLAINT", intent_confidence=0.2)}
    assert dispatch(state, ROUTES, THRESHOLD, INTENT_THRESHOLD) == "respond"


def test_dispatch_sends_cancel_intent_to_cancel():
    state = {"classification": _classification(intent="CANCEL")}
    assert dispatch(state, ROUTES, THRESHOLD, INTENT_THRESHOLD) == "cancel"


def test_dispatch_sends_general_inquiry_to_load_context_with_high_confidence():
    state = {"classification": _classification(intent="GENERAL_INQUIRY", intent_confidence=0.9)}
    assert dispatch(state, ROUTES, THRESHOLD, INTENT_THRESHOLD) == "load_context"


def test_dispatch_sends_general_inquiry_to_respond_with_low_confidence():
    state = {"classification": _classification(intent="GENERAL_INQUIRY", intent_confidence=0.2)}
    assert dispatch(state, ROUTES, THRESHOLD, INTENT_THRESHOLD) == "respond"
