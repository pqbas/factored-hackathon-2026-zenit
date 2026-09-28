"""LangGraph checkpointer: Lakebase in an app, in-process memory locally.

``AsyncCheckpointSaver`` manages its own Lakebase connection, so it does not
go through ``src/db/connection.py`` (that shared pool arrives in Phase 6).
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from databricks_langchain.checkpoint import AsyncCheckpointSaver
from langgraph.checkpoint.memory import MemorySaver

from src.config import settings

logger = logging.getLogger(__name__)

_CHECKPOINTER_SETUP_DONE = False
_CHECKPOINTER_SETUP_LOCK: Optional[asyncio.Lock] = None

# Without Lakebase (local dev) conversation state lives in process memory and is lost on restart.
_MEMORY_SAVER = None if settings.lakebase_instance_name else MemorySaver()
if _MEMORY_SAVER is not None:
    logger.warning("LAKEBASE_INSTANCE_NAME not set: using in-memory checkpointer (local dev only)")


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


@asynccontextmanager
async def checkpointer():
    if _MEMORY_SAVER is not None:
        yield _MEMORY_SAVER
        return
    async with AsyncCheckpointSaver(
        instance_name=settings.lakebase_instance_name, schema=settings.checkpoint_schema,
    ) as cp:
        await _ensure_checkpointer_setup(cp)
        yield cp
