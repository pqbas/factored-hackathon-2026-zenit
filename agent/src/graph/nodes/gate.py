from langchain_core.messages import AIMessage

from src.graph.state import AgentState
from src.prompts.messages import SESSION_REJECTED


def gate(state: AgentState) -> dict:
    session = state["session"]
    if session.get("authenticated"):
        return {}
    reason = session.get("reason") or "missing"
    return {"messages": [AIMessage(content=SESSION_REJECTED[reason])]}
