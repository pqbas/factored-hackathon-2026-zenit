from langchain_core.messages import AIMessage

from src.graph.state import AgentState
from src.prompts.messages import CANCEL_REPLY


def cancel(state: AgentState) -> dict:
    classification = state.get("classification") or {}
    language = classification.get("language") if classification.get("language") in ("es", "pt") else "es"
    return {"messages": [AIMessage(content=CANCEL_REPLY[language])]}
