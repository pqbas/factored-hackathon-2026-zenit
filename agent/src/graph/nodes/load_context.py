from src.graph.state import AgentState


def load_context(state: AgentState) -> dict:
    return {"use_case": state["classification"]["intent"]}
