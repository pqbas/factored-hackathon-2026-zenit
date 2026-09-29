from src.graph.state import AgentState
from src.tools.handoff import case_summary


async def summarize_handoff(state: AgentState, llm) -> dict:
    # Its own node, outside main's streaming nodes: in respond, the summary's tokens were
    # streamed to the customer ahead of "Te comunico con un asesor…".
    handoff = state["handoff"]
    summary = await case_summary(llm, handoff["reason"], handoff["facts"]["verified_data"])
    return {"handoff": {**handoff, "summary": summary}}
