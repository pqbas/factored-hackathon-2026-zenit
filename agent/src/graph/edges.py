from langgraph.graph import END

from src.graph.state import AgentState


def after_gate(state: AgentState) -> str:
    if state["session"].get("authenticated"):
        return "respond"
    return END
