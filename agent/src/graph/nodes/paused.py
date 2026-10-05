from src.graph.state import AgentState
from src.prompts.advisor import ADVISOR_PREFIX
from src.prompts.messages import HANDOFF_REPLY

# The values custom_inputs.handled_by can take (docs/limites-agente-back.md); only this one is David's.
_AI_AGENT = "ai_agent"


def _role_and_text(message) -> tuple[str | None, str]:
    if isinstance(message, dict):
        role, content = message.get("role"), message.get("content")
    else:
        role, content = getattr(message, "type", None), message.content
    role = "assistant" if role in ("assistant", "ai") else role
    if isinstance(content, list):
        content = " ".join(part.get("text", "") for part in content if isinstance(part, dict))
    return role, (content or "").strip()


def _left_with_an_advisor(messages: list) -> bool:
    """The history has David's handoff reply and no advisor message after it."""
    handoff_replies = set(HANDOFF_REPLY.values())
    paused = False
    for message in messages:
        role, text = _role_and_text(message)
        if role != "assistant":
            continue
        if text in handoff_replies:
            paused = True
        elif text.startswith(ADVISOR_PREFIX):
            paused = False
    return paused


def paused(state: AgentState) -> dict:
    handled_by = state["session"].get("handled_by")
    if handled_by:
        return {"paused": handled_by != _AI_AGENT}
    return {"paused": _left_with_an_advisor(state["messages"])}
