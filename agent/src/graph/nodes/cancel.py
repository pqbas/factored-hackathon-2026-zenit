from langchain_core.messages import AIMessage

from src.graph.state import AgentState
from src.prompts.messages import CANCEL_REPLY
from src.schemas.classification import reply_language


def cancel(state: AgentState) -> dict:
    classification = state.get("classification") or {}
    return {"messages": [AIMessage(content=CANCEL_REPLY[reply_language(classification.get("language"))])]}
