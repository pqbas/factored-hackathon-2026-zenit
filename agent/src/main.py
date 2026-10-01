from dotenv import load_dotenv

# Load env vars from .env before importing anything that reads them at import time
# (src/config.py's module-level `settings`).
load_dotenv(dotenv_path=".env", override=True)

import json  # noqa: E402
import logging  # noqa: E402
import uuid  # noqa: E402
from typing import Any, AsyncGenerator, AsyncIterator  # noqa: E402

import mlflow  # noqa: E402
from langchain_core.messages import AIMessageChunk, ToolMessage  # noqa: E402
from mlflow.genai.agent_server import (  # noqa: E402
    AgentServer,
    invoke,
    setup_mlflow_git_based_version_tracking,
    stream,
)
from mlflow.types.responses import (  # noqa: E402
    ResponsesAgentRequest,
    ResponsesAgentResponse,
    ResponsesAgentStreamEvent,
    create_text_delta,
    output_to_responses_items_stream,
    to_chat_completions_input,
)

from src.config import settings  # noqa: E402
from src.db.session_repo import resolve_session  # noqa: E402
from src.graph.build import GRAPH_NODES, build_graph  # noqa: E402
from src.diag import add_latency_route, build_probes  # noqa: E402
from src.inbound_auth import add_token_check  # noqa: E402
from src.llm.chat import get_chat_model  # noqa: E402
from src.llm.jev import JevClient  # noqa: E402
from src.llm.llm_classifier import LLMClassifier  # noqa: E402
from src.llm.usage import TurnUsage  # noqa: E402
from src.observability import configure_tracing  # noqa: E402
from src.prompts.advisor import AdvisorPrefixStreamFilter  # noqa: E402
from src.prompts.version import prompt_version  # noqa: E402
from src.schemas.routing import load_routing  # noqa: E402
from src.schemas.turn_outputs import turn_custom_outputs  # noqa: E402
from src.tools.tools_for import tools_for  # noqa: E402

logger = logging.getLogger(__name__)

# src/ logs at INFO (the classify source of each turn, the classifier at startup); the root
# logger has no handler and stays at WARNING, so library INFO logs don't flood the App logs.
_src_logger = logging.getLogger("src")
_src_logger.setLevel(logging.INFO)
_src_handler = logging.StreamHandler()
_src_handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
_src_logger.addHandler(_src_handler)

configure_tracing(settings.tracing_enabled)

# Loaded once at import so a bad routing.yaml fails at startup, not on the first request.
routes = load_routing(settings.routing_path, GRAPH_NODES)

if settings.classifier not in ("jev", "llm"):
    raise ValueError(f"CLASSIFIER must be jev or llm, got {settings.classifier!r}")

# Only built with CLASSIFIER=jev. None when JEV_API_KEY isn't set (local dev without a key):
# classify then falls back to rules.
jev_client = (
    JevClient(api_key=settings.jev_api_key, url=settings.jev_url, timeout=settings.jev_timeout_seconds)
    if settings.classifier == "jev" and settings.jev_api_key
    else None
)
logger.info("Classifier: %s (Jev configured: %s)", settings.classifier, jev_client is not None)

# Keeps the prompt bounded on long chats; the back still stores the whole conversation.
MAX_HISTORY_MESSAGES = 20

# Only the respond node streams text deltas; every node's final message is
# emitted as output_item.done via the "updates" branch below.
_STREAMING_NODES = frozenset({"respond"})


def _thread_id(request: ResponsesAgentRequest) -> str:
    custom_inputs = dict(request.custom_inputs or {})

    if custom_inputs.get("thread_id"):
        return str(custom_inputs["thread_id"])

    if request.context and getattr(request.context, "conversation_id", None):
        return str(request.context.conversation_id)

    return str(uuid.uuid4())


async def _process_agent_astream_events(
    async_stream: AsyncIterator[Any], turn: dict
) -> AsyncGenerator[ResponsesAgentStreamEvent, None]:
    """Convert LangGraph stream events into ResponsesAgentStreamEvent objects, recording in
    `turn` the classification and use case the nodes wrote."""
    prefix_filter = AdvisorPrefixStreamFilter()
    async for event in async_stream:
        if event[0] == "updates":
            # A reply shorter than the prefix is still held back: release it before its item.
            for item_id, text in prefix_filter.flush().items():
                yield ResponsesAgentStreamEvent(**create_text_delta(delta=text, item_id=item_id))
            for node_name, node_data in event[1].items():
                if not node_data:
                    continue
                for key in ("classification", "use_case", "handoff", "paused", "guard"):
                    if key in node_data:
                        turn[key] = node_data[key]
                if len(node_data.get("messages", [])) > 0:
                    for msg in node_data["messages"]:
                        if isinstance(msg, ToolMessage) and not isinstance(msg.content, str):
                            msg.content = json.dumps(msg.content)
                    for item in output_to_responses_items_stream(node_data["messages"]):
                        yield item
        elif event[0] == "messages":
            try:
                chunk = event[1][0]
                metadata = event[1][1] if len(event[1]) > 1 else {}
                if metadata.get("langgraph_node") not in _STREAMING_NODES:
                    continue
                # A use-case turn goes out whole: the LLM may write text next to a
                # hand_off_to_advisor call, and none of it may reach the customer.
                if turn.get("use_case"):
                    continue
                if isinstance(chunk, AIMessageChunk) and (content := chunk.content):
                    if delta := prefix_filter.feed(chunk.id, content):
                        yield ResponsesAgentStreamEvent(
                            **create_text_delta(delta=delta, item_id=chunk.id)
                        )
            except Exception:
                logger.exception("Error processing agent stream event")


@invoke()
async def non_streaming(request: ResponsesAgentRequest) -> ResponsesAgentResponse:
    thread_id = _thread_id(request)
    request.custom_inputs = dict(request.custom_inputs or {})
    request.custom_inputs["thread_id"] = thread_id

    events = [event async for event in streaming(request)]
    done_events = [event for event in events if event.type == "response.output_item.done"]
    # A paused turn has no items, so its custom_outputs ride on a bare event.
    custom_outputs = next(
        (event.custom_outputs for event in reversed(events) if event.custom_outputs),
        {"thread_id": thread_id},
    )
    return ResponsesAgentResponse(
        output=[event.item for event in done_events], custom_outputs=custom_outputs
    )


def _conversation_start(custom_inputs: dict) -> int:
    value = custom_inputs.get("conversation_start")
    return value if isinstance(value, int) and not isinstance(value, bool) and value > 0 else 0


@stream()
async def streaming(
    request: ResponsesAgentRequest,
) -> AsyncGenerator[ResponsesAgentStreamEvent, None]:
    thread_id = _thread_id(request)
    if settings.tracing_enabled:
        mlflow.update_current_trace(metadata={"mlflow.trace.session": thread_id})

    custom_inputs = dict(request.custom_inputs or {})
    # Identity is resolved from the trusted session token on every turn, never from chat text.
    session = await resolve_session(custom_inputs)
    # The back owns the conversation and sends the whole history on every request
    # (docs/limites-agente-back.md); the agent keeps no state between requests.
    history = to_chat_completions_input([i.model_dump() for i in request.input])
    messages = history[-MAX_HISTORY_MESSAGES:]
    input_state = {
        "messages": messages,
        # The back's index counts the whole history; the messages before the cut are gone.
        "conversation_start": max(0, _conversation_start(custom_inputs) - (len(history) - len(messages))),
        # handled_by says who owns the conversation now; the paused node reads it.
        "session": {
            **session.as_dict(),
            "handled_by": custom_inputs.get("handled_by"),
            # The ES | PT selector of the chat; anything else is ignored.
            "chosen_language": custom_inputs.get("language") if custom_inputs.get("language") in ("es", "pt") else None,
        },
        "thread_id": thread_id,
    }

    llm = get_chat_model()
    classifier = (
        LLMClassifier(llm, settings.classifier_timeout_seconds) if settings.classifier == "llm" else jev_client
    )
    graph = build_graph(
        llm,
        classifier,
        routes,
        settings.guardrail_threshold,
        settings.intent_threshold,
        tools_for,
    )
    # The turn's signals ride on its last output_item.done, so each done event is held back
    # until the next one arrives or the stream ends.
    turn: dict = {"classification": None, "use_case": None, "handoff": None, "paused": False, "guard": None}
    last_done = None
    # The callbacks reach every LLM call inside the nodes (classifier, collector, respond, summary).
    usage = TurnUsage()
    async for event in _process_agent_astream_events(
        graph.astream(input_state, config={"callbacks": [usage]}, stream_mode=["updates", "messages"]), turn
    ):
        if event.type != "response.output_item.done":
            yield event
            continue
        if last_done is not None:
            yield last_done
        last_done = event
    custom_outputs = turn_custom_outputs(
        thread_id, turn["classification"], turn["use_case"], settings.guardrail_threshold,
        turn["handoff"], turn["paused"], usage.totals(), settings.llm_endpoint, prompt_version(),
        settings.classifier, turn["guard"],
    )
    if turn["paused"]:
        # No text item at all: the smallest event that carries custom_outputs.
        yield ResponsesAgentStreamEvent(type="response.in_progress", custom_outputs=custom_outputs)
    elif last_done is not None:
        yield last_done.model_copy(update={"custom_outputs": custom_outputs})


server = AgentServer("ResponsesAgent", enable_chat_proxy=False)  # UI lives in ../back

# Define the app as a module level variable to enable multiple workers
app = server.app  # noqa: F841
add_token_check(app, settings.agent_token)
logger.info("Inbound token check: %s", "on" if settings.agent_token else "off")
if settings.agent_token:
    # Only behind the token (AWS): see docs/16.
    add_latency_route(app, build_probes(get_chat_model(), jev_client, routes))
if settings.tracing_enabled:
    # Links traces to a LoggedModel of the git commit; without tracing it only costs REST calls.
    setup_mlflow_git_based_version_tracking()


def main():
    server.run(app_import_string="src.main:app")
