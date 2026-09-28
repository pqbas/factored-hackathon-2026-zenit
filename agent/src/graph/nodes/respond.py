from pathlib import Path

from langchain_core.messages import SystemMessage

from src.graph.state import AgentState

SYSTEM_PROMPT = (Path(__file__).resolve().parents[2] / "prompts" / "system.md").read_text()

_LANGUAGE_LINE = {
    "es": "\n\nResponde en español.",
    "pt": "\n\nResponda em português.",
}


async def respond(state: AgentState, llm) -> dict:
    classification = state.get("classification") or {}
    language_line = _LANGUAGE_LINE.get(classification.get("language"), "")
    system_prompt = SYSTEM_PROMPT + language_line

    messages = [SystemMessage(content=system_prompt), *state["messages"]]
    reply = await llm.ainvoke(messages)
    return {"messages": [reply]}
