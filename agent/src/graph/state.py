from typing import Annotated, TypedDict

from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    # Index in messages of the first message of the current conversation (the back's custom_inputs).
    conversation_start: int
    session: dict
    thread_id: str
    classification: dict | None
    use_case: str | None
    handoff: dict | None
    confirmation: bool
    paused: bool
    guard: dict | None
    fraud_assessment: dict | None
