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
from src.llm.chat import get_chat_model  # noqa: E402
from src.llm.jev import JevClient  # noqa: E402
from src.schemas.routing import load_routing  # noqa: E402
from src.tools.mcp_client import tools_for  # noqa: E402

logger = logging.getLogger(__name__)

mlflow.langchain.autolog()

# Loaded once at import so a bad routing.yaml fails at startup, not on the first request.
routes = load_routing(settings.routing_path, GRAPH_NODES)

# None when JEV_API_KEY isn't set (local dev without a key): classify then falls back to rules.
jev_client = (
    JevClient(api_key=settings.jev_api_key, url=settings.jev_url, timeout=settings.jev_timeout_seconds)
    if settings.jev_api_key
    else None
)

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
    async_stream: AsyncIterator[Any],
) -> AsyncGenerator[ResponsesAgentStreamEvent, None]:
    """Convert LangGraph stream events into ResponsesAgentStreamEvent objects."""
    async for event in async_stream:
        if event[0] == "updates":
            for node_name, node_data in event[1].items():
                if not node_data:
                    continue
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
                if isinstance(chunk, AIMessageChunk) and (content := chunk.content):
                    yield ResponsesAgentStreamEvent(
                        **create_text_delta(delta=content, item_id=chunk.id)
                    )
            except Exception:
                logger.exception("Error processing agent stream event")


@invoke()
async def non_streaming(request: ResponsesAgentRequest) -> ResponsesAgentResponse:
    thread_id = _thread_id(request)
    request.custom_inputs = dict(request.custom_inputs or {})
    request.custom_inputs["thread_id"] = thread_id

    outputs = [
        event.item
        async for event in streaming(request)
        if event.type == "response.output_item.done"
    ]
    return ResponsesAgentResponse(output=outputs, custom_outputs={"thread_id": thread_id})


@stream()
async def streaming(
    request: ResponsesAgentRequest,
) -> AsyncGenerator[ResponsesAgentStreamEvent, None]:
    thread_id = _thread_id(request)
    mlflow.update_current_trace(metadata={"mlflow.trace.session": thread_id})

    custom_inputs = dict(request.custom_inputs or {})
    # Identity is resolved from the trusted session token on every turn, never from chat text.
    session = resolve_session(custom_inputs)
    # The back owns the conversation and sends the whole history on every request
    # (docs/limites-agente-back.md); the agent keeps no state between requests.
    history = to_chat_completions_input([i.model_dump() for i in request.input])
    input_state = {
        "messages": history[-MAX_HISTORY_MESSAGES:],
        "session": session.as_dict(),
        "thread_id": thread_id,
    }

    graph = build_graph(
        get_chat_model(),
        jev_client,
        routes,
        settings.guardrail_threshold,
        settings.intent_threshold,
        tools_for,
    )
    async for event in _process_agent_astream_events(
        graph.astream(input_state, stream_mode=["updates", "messages"])
    ):
        yield event


server = AgentServer("ResponsesAgent", enable_chat_proxy=False)  # UI lives in ../back

# Define the app as a module level variable to enable multiple workers
app = server.app  # noqa: F841
setup_mlflow_git_based_version_tracking()


def main():
    server.run(app_import_string="src.main:app")
