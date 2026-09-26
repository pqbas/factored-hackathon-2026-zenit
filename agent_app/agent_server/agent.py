import asyncio
import logging
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator, Optional

import mlflow
import psycopg
from databricks_langchain.chat_models import ChatDatabricks
from databricks_langchain.checkpoint import AsyncCheckpointSaver
from mlflow.genai.agent_server import invoke, stream
from mlflow.types.responses import (
    ResponsesAgentRequest,
    ResponsesAgentResponse,
    ResponsesAgentStreamEvent,
    to_chat_completions_input,
)
from langgraph.checkpoint.memory import MemorySaver

from agent_server.dispute.data import InMemoryBankData, WarehouseBankData
from agent_server.dispute.graph import build_dispute_graph
from agent_server.dispute.session import resolve_session
from agent_server.utils import process_agent_astream_events

logger = logging.getLogger(__name__)


mlflow.langchain.autolog()
# Non-reasoning model: the LLM only does intent + slot extraction, where it matched the reasoning
# model's accuracy on our checks at ~1s instead of ~9s per turn.
LLM_ENDPOINT = os.getenv("LLM_ENDPOINT", "databricks-qwen3-next-80b-a3b-instruct")
_llm = ChatDatabricks(endpoint=LLM_ENDPOINT, temperature=0)
LAKEBASE_INSTANCE_NAME = os.getenv("LAKEBASE_INSTANCE_NAME", "")
# Dedicated Postgres schema for the LangGraph checkpointer. Using a
# per-accelerator schema avoids the Postgres 14+ default where only the DB
# owner can create objects in `public` — which blocks the deployed app's
# service principal when `public` is owned by a different user. The schema
# is auto-created on first setup(). Override with CHECKPOINT_SCHEMA if you
# need to run several deployments of this accelerator in one database.
CHECKPOINT_SCHEMA = os.getenv("CHECKPOINT_SCHEMA", "agent_checkpoints")
_CHECKPOINTER_SETUP_DONE = False
_CHECKPOINTER_SETUP_LOCK: Optional[asyncio.Lock] = None

# Without Lakebase (local dev) conversation state lives in process memory and is lost on restart.
_MEMORY_SAVER = None if LAKEBASE_INSTANCE_NAME else MemorySaver()
if _MEMORY_SAVER is not None:
    logger.warning("LAKEBASE_INSTANCE_NAME not set: using in-memory checkpointer (local dev only)")


def _make_bank_data():
    """SQL warehouse over Unity Catalog when DATABRICKS_WAREHOUSE_ID is set; dummy CSVs otherwise."""
    warehouse_id = os.getenv("DATABRICKS_WAREHOUSE_ID")
    if warehouse_id:
        return WarehouseBankData(warehouse_id, catalog=os.getenv("BANK_CATALOG", "workspace"))
    csv_dir = os.getenv("BANK_DATA_CSV_DIR", str(Path(__file__).resolve().parents[2] / "data" / "dummy_output"))
    logger.warning("DATABRICKS_WAREHOUSE_ID not set: using dummy CSVs from %s", csv_dir)
    return InMemoryBankData.from_csv_dir(csv_dir)


_BANK_DATA = _make_bank_data()


def build_graph(checkpointer):
    return build_dispute_graph(_BANK_DATA, llm=_llm, checkpointer=checkpointer)


async def _ensure_checkpointer_setup(checkpointer: AsyncCheckpointSaver) -> None:
    global _CHECKPOINTER_SETUP_DONE, _CHECKPOINTER_SETUP_LOCK

    if _CHECKPOINTER_SETUP_DONE:
        return

    if _CHECKPOINTER_SETUP_LOCK is None:
        _CHECKPOINTER_SETUP_LOCK = asyncio.Lock()

    async with _CHECKPOINTER_SETUP_LOCK:
        if _CHECKPOINTER_SETUP_DONE:
            return
        await checkpointer.setup()
        _CHECKPOINTER_SETUP_DONE = True


def _get_or_create_thread_id(request: ResponsesAgentRequest) -> str:
    custom_inputs = dict(request.custom_inputs or {})

    if custom_inputs.get("thread_id"):
        return str(custom_inputs["thread_id"])

    if request.context and getattr(request.context, "conversation_id", None):
        return str(request.context.conversation_id)

    return str(uuid.uuid4())


@invoke()
async def non_streaming(request: ResponsesAgentRequest) -> ResponsesAgentResponse:
    thread_id = _get_or_create_thread_id(request)
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
    thread_id = _get_or_create_thread_id(request)
    mlflow.update_current_trace(metadata={"mlflow.trace.session": thread_id})

    custom_inputs = dict(request.custom_inputs or {})
    config = {"configurable": {"thread_id": thread_id}}
    # Identity is resolved from the trusted session token on every turn, never from chat text.
    session = resolve_session(custom_inputs)
    input_state = {
        "messages": to_chat_completions_input([i.model_dump() for i in request.input])[-1:],
        "session": session.as_dict(),
        "thread_id": thread_id,
    }

    # One-shot retry guards against a transient psycopg OperationalError that
    # sometimes fires on the first Lakebase checkpoint write after a cold
    # start ("SSL error: unexpected eof while reading"). We only retry when
    # no events have been streamed to the client yet.
    for attempt in range(2):
        events_yielded = 0
        try:
            async with _checkpointer() as checkpointer:
                graph = build_graph(checkpointer)
                async for event in process_agent_astream_events(
                    graph.astream(input_state, config, stream_mode=["updates", "messages"])
                ):
                    yield event
                    events_yielded += 1

                try:
                    values = (await graph.aget_state(config)).values
                    yield ResponsesAgentStreamEvent(
                        type="workflow.state.updated",
                        custom_outputs={
                            "workflow_stage": values.get("stage", ""),
                            "workflow_intent": (values.get("understanding") or {}).get("intent", ""),
                            "case": values.get("case"),
                            "decision": values.get("decision"),
                            "handoff": values.get("handoff"),
                        },
                    )
                    events_yielded += 1
                except Exception:
                    logger.exception("Failed to emit workflow metadata event")
            return
        except psycopg.OperationalError as exc:
            if attempt == 0 and events_yielded == 0:
                logger.warning(
                    "Lakebase checkpoint connection dropped before any output; "
                    "retrying once. Error: %s", exc,
                )
                continue
            raise


@asynccontextmanager
async def _checkpointer():
    if _MEMORY_SAVER is not None:
        yield _MEMORY_SAVER
        return
    async with AsyncCheckpointSaver(
        instance_name=LAKEBASE_INSTANCE_NAME, schema=CHECKPOINT_SCHEMA,
    ) as checkpointer:
        await _ensure_checkpointer_setup(checkpointer)
        yield checkpointer
