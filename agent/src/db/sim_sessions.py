from __future__ import annotations

import re

from src.config import settings

_TABLE = re.compile(r"^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$")


def _query() -> str:
    table = settings.sim_sessions_table
    if not _TABLE.match(table):
        raise ValueError(f"SIM_SESSIONS_TABLE must be schema.table, got {table!r}")
    return f"SELECT customer_id, country, expires_at FROM {table} WHERE token = %(token)s"


async def lookup_sim_session(pool, token: str) -> dict | None:
    """The simulation's session row for a token (written by the back's daily script), or None."""
    async with pool.connection() as conn:
        cursor = await conn.execute(_query(), {"token": token})
        rows = await cursor.fetchall()
    return dict(rows[0]) if rows else None
