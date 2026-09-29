from typing import Annotated, TypedDict

from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    session: dict
    thread_id: str
    classification: dict | None
    use_case: str | None
    handoff: dict | None
    confirmation: bool
    paused: bool
