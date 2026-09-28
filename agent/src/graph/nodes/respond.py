from pathlib import Path

from langchain_core.messages import SystemMessage

from src.graph.state import AgentState
from src.prompts.situations import SITUATIONS, situation_for
from src.schemas.routing import IntentRoute, render_options

SYSTEM_PROMPT = (Path(__file__).resolve().parents[2] / "prompts" / "system.md").read_text()

_LANGUAGE_LINE = {
    "es": "\n\nResponde en español.",
    "pt": "\n\nResponda em português.",
}


async def respond(state: AgentState, llm, routes: list[IntentRoute], intent_threshold: float) -> dict:
    classification = state.get("classification") or {}
    situation = situation_for(classification, intent_threshold)
    language_line = _LANGUAGE_LINE.get(classification.get("language"), "")

    system_prompt = SYSTEM_PROMPT + "\n\n" + SITUATIONS[situation]
    if situation != "goodbye":
        options = render_options(routes, classification.get("language"))
        system_prompt += "\n\nOpciones:\n" + options
    system_prompt += language_line

    messages = [SystemMessage(content=system_prompt), *state["messages"]]
    reply = await llm.ainvoke(messages)
    return {"messages": [reply]}
