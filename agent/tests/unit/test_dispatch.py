from __future__ import annotations

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph import END

from src.graph.edges import dispatch
from src.schemas.routing import IntentRoute

ROUTES = [
    IntentRoute(intent="GENERAL_INQUIRY", description="d", examples=["e"], destination="respond"),
    IntentRoute(intent="COMPLAINT", description="d", examples=["e"], destination="respond"),
]


def test_dispatch_returns_end_for_a_blocked_turn():
    state = {
        "messages": [HumanMessage(content="hola"), AIMessage(content="bloqueado")],
        "classification": {"intent": "GENERAL_INQUIRY"},
    }
    assert dispatch(state, ROUTES) == END


def test_dispatch_returns_the_routes_destination_for_a_known_intent():
    state = {
        "messages": [HumanMessage(content="no reconozco un cargo")],
        "classification": {"intent": "COMPLAINT"},
    }
    assert dispatch(state, ROUTES) == "respond"


def test_dispatch_returns_respond_for_an_unknown_intent():
    state = {
        "messages": [HumanMessage(content="???")],
        "classification": {"intent": "NOT_A_REAL_INTENT"},
    }
    assert dispatch(state, ROUTES) == "respond"
