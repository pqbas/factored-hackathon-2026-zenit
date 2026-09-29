import logging
from pathlib import Path

from langchain_core.messages import AIMessage, SystemMessage, ToolMessage

from src.graph.state import AgentState
from src.prompts.advisor import strip_advisor_prefix
from src.prompts.situations import SITUATIONS, fixed_reply, situation_for
from src.schemas.routing import IntentRoute
from src.prompts.messages import HANDOFF_REPLY, TOOL_DOWN
from src.schemas.classification import reply_language
from src.tools.bind_customer import bind_customer
from src.tools.collector import CollectorUnavailable, card_to_fetch, extract_fields, next_step
from src.tools.grounding import ungrounded
from src.tools.handoff import HANDOFF_TOOL_NAME, handoff_tool, tool_rows, verify_case

logger = logging.getLogger(__name__)

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

# The cases whose fields code collects (3.C, 3.D1); 3.D2 needs the LLM to explain the status.
_COLLECTED = ("complaint", "retention")

# Bounds the tool-calling loop below so a misbehaving LLM can't call tools forever.
_MAX_TOOL_ROUNDS = 4


async def respond(
    state: AgentState, llm, routes: list[IntentRoute], intent_threshold: float, tools_for
) -> dict:
    classification = state.get("classification") or {}
    language_line = _LANGUAGE_LINE.get(classification.get("language"), "")
    use_case = state.get("use_case")

    if use_case:
        route = next(route for route in routes if route.intent == use_case)
        if route.handoff_reason in _COLLECTED and not state.get("confirmation"):
            try:
                return await _collect(state, llm, route, tools_for)
            except CollectorUnavailable as exc:
                logger.warning("Collector unavailable, the LLM collects the case: %s", exc)
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

    tools = await _bound_tools(state, route, tools_for)
    tools_by_name = {tool.name: tool for tool in tools}
    if route.handoff_reason:
        tools.append(handoff_tool(route.handoff_reason))
    # The rows each UC tool returned in this turn, by short name (get_products): what a
    # handoff is verified against, since the agent keeps nothing between turns.
    rows_by_tool: dict[str, list[dict]] = {}
    bound_llm = llm.bind_tools(tools)
    # The first round must call a tool: without it the LLM answered a follow-up ("E limite?")
    # with made-up figures, since the history only holds earlier replies, never tool results.
    # On the customer's yes to the confirmation question the LLM once rewrote the summary
    # instead of handing off, so that turn forces the handoff tool.
    forced = HANDOFF_TOOL_NAME if state.get("confirmation") and route.handoff_reason else "required"
    first_llm = llm.bind_tools(tools, tool_choice=forced)

    messages = [SystemMessage(content=system_prompt), *state["messages"]]
    customer_text = _last_customer_text(state)
    # The UC tools that returned without raising in this turn: what the grounding guard checks.
    called_ok: set[str] = set()
    guard: dict | None = None
    # The LLM calls the handoff before any UC tool and has made up the complaint_id; after the
    # error it wrote text instead of retrying, so the round after a failed check is forced once.
    forced_retries = 1 if route.handoff_reason else 0
    reply = await first_llm.ainvoke(messages)
    # Two passes at most: the second only runs when the guard forced the missing tool.
    for attempt in range(2):
        rounds = 0
        while reply.tool_calls and rounds < _MAX_TOOL_ROUNDS:
            messages.append(reply)
            handoff_failed = False
            for tool_call in reply.tool_calls:
                if tool_call["name"] == HANDOFF_TOOL_NAME and route.handoff_reason:
                    await _fetch_missing_rows(route.handoff_reason, tool_call["args"], tools_by_name, rows_by_tool)
                    verified = verify_case(route.handoff_reason, tool_call["args"], rows_by_tool)
                    if isinstance(verified, dict):
                        # The turn ends here: the other tool calls of this round never run and the LLM isn't called again.
                        return _hand_off(state, route, verified, rows_by_tool)
                    # The error names only product digits and field names, never the customer's text.
                    logger.warning("Handoff not verified: %s", verified)
                    messages.append(ToolMessage(content=verified, tool_call_id=tool_call["id"]))
                    handoff_failed = True
                    continue
                tool = tools_by_name.get(tool_call["name"])
                if tool is None:
                    messages.append(ToolMessage(content=f"Unknown tool {tool_call['name']!r}", tool_call_id=tool_call["id"]))
                    continue
                try:
                    result = await tool.ainvoke(tool_call["args"])
                except Exception as exc:  # noqa: BLE001 - a UC tool failing ends the turn with a fixed text
                    logger.warning("Tool %s failed: %s", tool_call["name"], type(exc).__name__)
                    return _safe_reply(state, guard)
                short_name = tool_call["name"].split("__")[-1]
                called_ok.add(short_name)
                rows_by_tool.setdefault(short_name, []).extend(tool_rows(result))
                content = str(result)
                messages.append(ToolMessage(content=content, tool_call_id=tool_call["id"]))
            rounds += 1
            if handoff_failed and forced_retries:
                forced_retries -= 1
                retry_llm = llm.bind_tools(tools, tool_choice=HANDOFF_TOOL_NAME)
                reply = await retry_llm.ainvoke(messages + reminder)
            else:
                reply = await bound_llm.ainvoke(messages + reminder)
        if reply.tool_calls:
            # Out of rounds: answer from the tool results so far instead of ending on a tool call.
            reply = await llm.ainvoke(messages + reminder)

        reply = _without_advisor_prefix(reply)
        missing = ungrounded(route, customer_text, _text(reply), called_ok)
        if missing is None:
            if guard:
                guard["action"] = "retried_ok"
            break
        # Kind and tool only: the draft is never logged or stored.
        logger.warning("Grounding guard: %s shown without %s (attempt %d)", missing.kind, missing.tool, attempt + 1)
        guard = {"fired": True, "missing_tool": missing.tool, "action": "safe_reply"}
        forced_name = next((name for name in tools_by_name if name.split("__")[-1] == missing.tool), None)
        if attempt == 1 or forced_name is None:
            return _safe_reply(state, guard)
        reply = await llm.bind_tools(tools, tool_choice=forced_name).ainvoke(messages + reminder)

    # Only the final AIMessage is kept in the conversation history; the tool calls and
    # results above stay in `messages` locally and are captured by the MLflow trace.
    return {"messages": [reply], "guard": guard}


def _text(reply) -> str:
    return reply.content if isinstance(reply.content, str) else ""


def _last_customer_text(state: AgentState) -> str:
    for message in reversed(state["messages"]):
        if getattr(message, "type", None) == "human":
            return message.content if isinstance(message.content, str) else ""
    return ""


def _safe_reply(state: AgentState, guard: dict | None) -> dict:
    return {"messages": [AIMessage(content=_tool_down(state))], "guard": guard}


def _tool_down(state: AgentState) -> str:
    return TOOL_DOWN[reply_language((state.get("classification") or {}).get("language"))]


async def _bound_tools(state: AgentState, route: IntentRoute, tools_for) -> list:
    customer_id = state["session"]["customer_id"]
    fail_tools = state["session"].get("fail_tools", ())
    return [
        bind_customer(tool, customer_id, fail=tool.name.split("__")[-1] in fail_tools)
        for schema in route.schemas
        for tool in await tools_for(schema)
    ]


async def _collect(state: AgentState, llm, route: IntentRoute, tools_for) -> dict:
    """Etapa 4 for 3.C and 3.D1: code decides the next question. The LLM only reads the
    conversation for the fields already given, so a field that is there is never asked again."""
    reason = route.handoff_reason
    language = reply_language((state.get("classification") or {}).get("language"))
    fields = await extract_fields(llm, reason, state["messages"])
    tools_by_name = {tool.name: tool for tool in await _bound_tools(state, route, tools_for)}
    rows_by_tool: dict[str, list[dict]] = {}
    failed = await _fetch_missing_rows(reason, {}, tools_by_name, rows_by_tool)
    if card := card_to_fetch(reason, fields, rows_by_tool):
        failed += await _fetch_missing_rows(reason, {"card_last4": card}, tools_by_name, rows_by_tool)
    if failed:
        logger.warning("Collector %s: fetching %s failed", reason, failed)
        return {"messages": [AIMessage(content=_tool_down(state))]}
    kind, text = next_step(reason, fields, rows_by_tool, language, state["messages"])
    logger.info("Collector %s: %s", reason, kind)
    return {"messages": [AIMessage(content=text)]}


def _hand_off(state: AgentState, route: IntentRoute, verified_data: dict, rows_by_tool: dict) -> dict:
    """Etapa 5: the fixed reply for the customer and custom_outputs.handoff for the back."""
    classification = state.get("classification") or {}
    language = classification.get("language")
    handoff = {
        "reason": route.handoff_reason,
        # Written by the summarize_handoff node, which doesn't stream to the customer.
        "summary": None,
        "facts": {
            "condition": None,
            "use_case": route.intent,
            "intent": classification.get("intent"),
            "language": language if language in ("es", "pt") else "other",
            "sentiment": classification.get("sentiment"),
            # The bank's case, when the customer asked about one that get_cases returned (3.D2).
            "case_id": verified_data.get("complaint_id"),
            "tools_called": sorted(rows_by_tool),
            "verified_data": verified_data,
        },
    }
    return {"messages": [AIMessage(content=HANDOFF_REPLY[reply_language(language)])], "handoff": handoff}


async def _fetch_missing_rows(reason: str, args: dict, tools_by_name: dict, rows_by_tool: dict) -> list[str]:
    """Calls the UC tools a handoff is verified against when the LLM didn't in this turn: in the
    App the LLM went straight to hand_off_to_advisor on the customer's "sí" and never recovered.
    Returns the names of the tools that failed."""
    by_short_name = {name.split("__")[-1]: tool for name, tool in tools_by_name.items()}
    needed: list[tuple[str, dict]] = []
    failed: list[str] = []
    card = args.get("card_last4")
    if reason == "case_status" and args.get("complaint_id"):
        needed.append(("get_cases", {}))
    elif reason in ("retention", "complaint") or card:
        needed.append(("get_products", {}))
        if card:
            needed.append(("list_transactions", {"product_last4": card}))
    for name, tool_args in needed:
        if rows_by_tool.get(name) or name not in by_short_name:
            continue
        try:
            result = await by_short_name[name].ainvoke(tool_args)
        except Exception as exc:  # noqa: BLE001 - verify_case then reports what is missing
            logger.warning("Fetching %s for a handoff failed: %s", name, type(exc).__name__)
            failed.append(name)
            continue
        rows_by_tool.setdefault(name, []).extend(tool_rows(result))
    # Names and counts only: which rows the handoff check had, never their values.
    logger.info(
        "Handoff %s with args %s: needed %s, tools %s, rows %s",
        reason, sorted(args), [name for name, _ in needed], sorted(tools_by_name),
        {name: len(rows) for name, rows in rows_by_tool.items()},
    )
    return failed
