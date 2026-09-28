from langgraph.graph import END

from src.graph.state import AgentState
from src.schemas.classification import Classification
from src.schemas.routing import IntentRoute


def after_gate(state: AgentState) -> str:
    if state["session"].get("authenticated"):
        return "classify"
    return END


def dispatch(
    state: AgentState, routes: list[IntentRoute], threshold: float, intent_threshold: float
) -> str:
    classification = Classification.model_validate(state["classification"])
    if classification.blocked(threshold):
        return END

    if classification.intent == "CANCEL":
        for route in routes:
            if route.intent == "CANCEL":
                return route.destination
        return "respond"

    if classification.intent_confidence < intent_threshold:
        return "respond"

    for route in routes:
        if route.intent == classification.intent:
            return route.destination
    return "respond"
