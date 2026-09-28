from langchain_core.messages import AIMessage
from langgraph.graph import END

from src.graph.state import AgentState
from src.schemas.routing import IntentRoute


def after_gate(state: AgentState) -> str:
    if state["session"].get("authenticated"):
        return "classify"
    return END


def dispatch(state: AgentState, routes: list[IntentRoute]) -> str:
    # classify already answered (a blocked/refused turn) when it appended an AIMessage.
    if isinstance(state["messages"][-1], AIMessage):
        return END

    intent = (state.get("classification") or {}).get("intent")
    for route in routes:
        if route.intent == intent:
            return route.destination
    return "respond"
