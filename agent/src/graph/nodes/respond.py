from pathlib import Path

from langchain_core.messages import SystemMessage, ToolMessage

from src.graph.state import AgentState
from src.prompts.situations import SITUATIONS, situation_for
from src.schemas.routing import IntentRoute, render_options
from src.tools.bind_customer import bind_customer

SYSTEM_PROMPT = (Path(__file__).resolve().parents[2] / "prompts" / "system.md").read_text()

_LANGUAGE_LINE = {
    "es": "\n\nResponde en español.",
    "pt": "\n\nResponda em português.",
}

# Bounds the tool-calling loop below so a misbehaving LLM can't call tools forever.
_MAX_TOOL_ROUNDS = 3


async def respond(
    state: AgentState, llm, routes: list[IntentRoute], intent_threshold: float, tools_for
) -> dict:
    classification = state.get("classification") or {}
    language_line = _LANGUAGE_LINE.get(classification.get("language"), "")
    use_case = state.get("use_case")

    if use_case:
        route = next(route for route in routes if route.intent == use_case)
        return await _respond_with_tools(state, llm, route, language_line, tools_for)

    situation = situation_for(classification, intent_threshold)
    system_prompt = SYSTEM_PROMPT + "\n\n" + SITUATIONS[situation]
    if situation != "goodbye":
        options = render_options(routes, classification.get("language"))
        system_prompt += "\n\nOpciones:\n" + options
    system_prompt += language_line

    messages = [SystemMessage(content=system_prompt), *state["messages"]]
    reply = await llm.ainvoke(messages)
    return {"messages": [reply]}


async def _respond_with_tools(
    state: AgentState, llm, route: IntentRoute, language_line: str, tools_for
) -> dict:
    system_prompt = SYSTEM_PROMPT + "\n\n" + route.instructions + language_line

    customer_id = state["session"]["customer_id"]
    tools = [
        bind_customer(tool, customer_id)
        for schema in route.schemas
        for tool in await tools_for(schema)
    ]
    tools_by_name = {tool.name: tool for tool in tools}
    bound_llm = llm.bind_tools(tools)

    messages = [SystemMessage(content=system_prompt), *state["messages"]]
    rounds = 0
    reply = await bound_llm.ainvoke(messages)
    while reply.tool_calls and rounds < _MAX_TOOL_ROUNDS:
        messages.append(reply)
        for tool_call in reply.tool_calls:
            tool = tools_by_name.get(tool_call["name"])
            try:
                if tool is None:
                    raise ValueError(f"Unknown tool {tool_call['name']!r}")
                content = str(await tool.ainvoke(tool_call["args"]))
            except Exception as exc:  # noqa: BLE001 - surfaced to the LLM as a failed tool result
                content = str(exc)
            messages.append(ToolMessage(content=content, tool_call_id=tool_call["id"]))
        rounds += 1
        reply = await bound_llm.ainvoke(messages)
    if reply.tool_calls:
        # Out of rounds: answer from the tool results so far instead of ending on a tool call.
        reply = await llm.ainvoke(messages)

    # Only the final AIMessage is kept in the conversation history; the tool calls and
    # results above stay in `messages` locally and are captured by the MLflow trace.
    return {"messages": [reply]}
