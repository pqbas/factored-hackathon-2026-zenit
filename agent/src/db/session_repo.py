from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from src.config import settings
from src.db.sim_sessions import lookup_sim_session

logger = logging.getLogger(__name__)

# The daily traffic simulation's tokens live in Lakebase (spec 30-09-26-sim-sessions).
_SIM_PREFIX = "sim-"

# Default fixture: real customers of the organizer's dataset (Active, no open cases, recent purchases).
_DEFAULT_SESSIONS = {
    "demo-mx-1": {"customer_id": "CLI-FLEUCGTWGAHL", "country": "México", "expires_at": "2099-01-01T00:00:00Z"},  # Santiago, México, USD
    "demo-co-1": {"customer_id": "CLI-7MPS3ZOPSN4Q", "country": "Colombia", "expires_at": "2099-01-01T00:00:00Z"},  # Javier, Colombia, COP
    "demo-ar-1": {"customer_id": "CLI-714PN0OOE0WX", "country": "Argentina", "expires_at": "2099-01-01T00:00:00Z"},  # Daniela, Argentina, ARS
    # 3.D2: a customer with real cases (one resolved, one in process, one open).
    "demo-mx-2": {"customer_id": "CLI-0IY07CEBUL79", "country": "México", "expires_at": "2099-01-01T00:00:00Z"},  # Eduardo, México, USD
    "demo-closed": {"customer_id": "CLI-02Y493OHFA18", "country": "Colombia", "expires_at": "2099-01-01T00:00:00Z"},  # customer_status=Closed
    "demo-expired": {"customer_id": "CLI-FLEUCGTWGAHL", "country": "México", "expires_at": "2020-01-01T00:00:00Z"},
}


@dataclass(frozen=True)
class Session:
    authenticated: bool
    customer_id: str | None = None
    country: str | None = None
    reason: str | None = None  # missing | invalid | expired
    # Short names of the UC tools that fail in this session (the evaluation's tool-down case).
    fail_tools: tuple[str, ...] = ()

    def as_dict(self) -> dict:
        return {"authenticated": self.authenticated, "customer_id": self.customer_id,
            "country": self.country,
            "reason": self.reason, "fail_tools": list(self.fail_tools)}


def _sessions() -> dict[str, dict]:
    raw = settings.demo_sessions_json
    return json.loads(raw) if raw else _DEFAULT_SESSIONS


async def resolve_session(custom_inputs: dict | None, now: datetime | None = None, pool=None) -> Session:
    now = now or datetime.now(timezone.utc)
    # No fallback identity: a request without a token never gets a customer's data.
    token = (custom_inputs or {}).get("session_token")
    if not token:
        return Session(False, reason="missing")
    token = str(token)
    entry = _sessions().get(token)
    if entry:
        expires = datetime.fromisoformat(entry["expires_at"].replace("Z", "+00:00"))
        if expires <= now:
            return Session(False, reason="expired")
        return Session(True, customer_id=entry["customer_id"], country=entry.get("country"),
            fail_tools=tuple(entry.get("fail_tools", ())))
    if not token.startswith(_SIM_PREFIX):
        return Session(False, reason="invalid")
    return await _resolve_sim_session(token, now, pool)


async def _resolve_sim_session(token: str, now: datetime, pool) -> Session:
    if pool is None:
        from src.tools.lakebase import LazyLakebasePool

        pool = LazyLakebasePool()
    try:
        row = await lookup_sim_session(pool, token)
    except Exception as exc:  # noqa: BLE001 - fail closed: no lookup, no session
        # The type only: the token is a credential and never goes to the logs.
        logger.warning("Simulated session lookup failed: %s", type(exc).__name__)
        return Session(False, reason="invalid")
    if row is None:
        return Session(False, reason="invalid")
    expires = row["expires_at"]
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires <= now:
        return Session(False, reason="expired")
    return Session(True, customer_id=row["customer_id"], country=row.get("country"))
