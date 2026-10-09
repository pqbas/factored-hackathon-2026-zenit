from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from databricks_ai_bridge.lakebase import AsyncLakebasePool
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from src.config import settings

_TIMEOUT_SECONDS = 5
_STATEMENT_TIMEOUT_MS = 5000

_pool: AsyncLakebasePool | AsyncConnectionPool | None = None
_lock: asyncio.Lock | None = None


async def _configure(conn) -> None:
    await conn.execute("SELECT set_config('statement_timeout', %s, false)", (str(_STATEMENT_TIMEOUT_MS),))


def _create_url_pool() -> AsyncConnectionPool:
    # Any Postgres with its own credentials (POSTGRES_URL): no token to rotate. Same
    # connection settings the Lakebase bridge uses.
    return AsyncConnectionPool(
        settings.postgres_url,
        min_size=1,
        max_size=4,
        timeout=_TIMEOUT_SECONDS,
        configure=_configure,
        open=False,
        kwargs={"autocommit": True, "row_factory": dict_row, "connect_timeout": _TIMEOUT_SECONDS},
    )


def _create_pool() -> AsyncLakebasePool | AsyncConnectionPool:
    if settings.postgres_url:
        return _create_url_pool()
    # The instance name resolves the host, and the workspace client (the App's service
    # principal in prod, the developer locally) mints the OAuth token; PGHOST isn't needed.
    # The bridge has no database argument, so it goes in the connection kwargs, which win
    # over its conninfo default.
    pool = AsyncLakebasePool(
        instance_name=settings.lakebase_instance,
        min_size=1,
        max_size=4,
        timeout=_TIMEOUT_SECONDS,
        configure=_configure,
    )
    pool.pool.kwargs["dbname"] = settings.lakebase_database
    pool.pool.kwargs["connect_timeout"] = _TIMEOUT_SECONDS
    return pool


async def get_pool() -> AsyncLakebasePool | AsyncConnectionPool:
    global _pool, _lock
    if _lock is None:
        _lock = asyncio.Lock()
    async with _lock:
        if _pool is None:
            pool = await asyncio.to_thread(_create_pool)
            await pool.open()
            _pool = pool
    return _pool


class LazyLakebasePool:
    """Opens the process's pool on the first query, so a Lakebase that is down fails the
    tool call (and gets the tool-failure reply) instead of the agent's startup."""

    @asynccontextmanager
    async def connection(self):
        pool = await get_pool()
        async with pool.connection() as conn:
            yield conn
