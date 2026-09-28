from pathlib import Path

from langchain_core.messages import SystemMessage

from src.graph.state import AgentState

SYSTEM_PROMPT = (Path(__file__).resolve().parents[2] / "prompts" / "system.md").read_text()


async def respond(state: AgentState, llm) -> dict:
    messages = [SystemMessage(content=SYSTEM_PROMPT), *state["messages"]]
    reply = await llm.ainvoke(messages)
    return {"messages": [reply]}
