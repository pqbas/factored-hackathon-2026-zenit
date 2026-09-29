from pathlib import Path

from langchain_core.messages import AIMessage, SystemMessage, ToolMessage

from src.graph.state import AgentState
from src.prompts.advisor import strip_advisor_prefix
from src.prompts.situations import SITUATIONS, fixed_reply, situation_for
from src.schemas.routing import IntentRoute
from src.tools.bind_customer import bind_customer

SYSTEM_PROMPT = (Path(__file__).resolve().parents[2] / "prompts" / "system.md").read_text()

_LANGUAGE_LINE = {
    "es": "\n\nResponde en español.",
    # Earlier replies in the history may be in Spanish (a one-word "olá" gets the country's
    # language); without saying so the LLM kept answering tool results in Spanish.
    "pt": (
        "\n\nEl cliente escribe en portugués: toda tu respuesta va en portugués, aunque tus "
        "respuestas anteriores de esta conversación estén en español. Responda em português."
    ),
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
    fixed = fixed_reply(situation, classification.get("language"))
    if fixed is not None:
        return {"messages": [AIMessage(content=fixed)]}
    system_prompt = SYSTEM_PROMPT + "\n\n" + SITUATIONS[situation] + language_line

    messages = [SystemMessage(content=system_prompt), *state["messages"]]
    reply = await llm.ainvoke(messages)
    return {"messages": [_without_advisor_prefix(reply)]}


def _without_advisor_prefix(reply):
    # The LLM may imitate the advisor turns in the history; the customer never sees the prefix.
    if isinstance(reply.content, str):
        return reply.model_copy(update={"content": strip_advisor_prefix(reply.content)})
    return reply


async def _respond_with_tools(
    state: AgentState, llm, route: IntentRoute, language_line: str, tools_for
) -> dict:
    system_prompt = SYSTEM_PROMPT + "\n\n" + route.instructions + language_line
    # Repeated after the tool results, right before the reply is written: with it only in the
    # first system prompt, the Spanish instructions and tool results pulled replies to Spanish.
    reminder = [SystemMessage(content=language_line.strip())] if language_line else []

    customer_id = state["session"]["customer_id"]
    tools = [
        bind_customer(tool, customer_id)
        for schema in route.schemas
        for tool in await tools_for(schema)
    ]
    tools_by_name = {tool.name: tool for tool in tools}
    bound_llm = llm.bind_tools(tools)
    # The first round must call a tool: without it the LLM answered a follow-up ("E limite?")
    # with made-up figures, since the history only holds earlier replies, never tool results.
    first_llm = llm.bind_tools(tools, tool_choice="required")

    messages = [SystemMessage(content=system_prompt), *state["messages"]]
    rounds = 0
    reply = await first_llm.ainvoke(messages)
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
        reply = await bound_llm.ainvoke(messages + reminder)
    if reply.tool_calls:
        # Out of rounds: answer from the tool results so far instead of ending on a tool call.
        reply = await llm.ainvoke(messages + reminder)

    # Only the final AIMessage is kept in the conversation history; the tool calls and
    # results above stay in `messages` locally and are captured by the MLflow trace.
    return {"messages": [_without_advisor_prefix(reply)]}
