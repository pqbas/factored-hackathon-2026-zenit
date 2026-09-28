from langgraph.graph import END

from src.graph.state import AgentState
from src.schemas.classification import Classification
from src.schemas.routing import IntentRoute


def after_gate(state: AgentState) -> str:
    if state["session"].get("authenticated"):
        return "classify"
    return END


def dispatch(state: AgentState, routes: list[IntentRoute], threshold: float) -> str:
    classification = Classification.model_validate(state["classification"])
    if classification.blocked(threshold):
        return END

    for route in routes:
        if route.intent == classification.intent:
            return route.destination
    return "respond"
