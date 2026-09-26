"""Trusted test session service.

The challenge requires that identity is proven by a trusted session, never by a
customer number typed in the chat. This module simulates that identity service:
the caller (chat UI / evaluation harness) sends an opaque ``session_token`` in
``custom_inputs``; the server resolves it to a customer_id. The conversation
text is never used to decide whose data is read.

Sessions are a clearly labeled TEST FIXTURE. Configure them with the
``DEMO_SESSIONS_JSON`` env var:

    {"tok-mx-1": {"customer_id": "CUS00000002", "expires_at": "2099-01-01T00:00:00Z"}}

``DEMO_SESSION_TOKEN`` sets the token used when a request carries none (local
demo through the chat UI only; leave unset in evaluation).
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone

# Default fixture: Active customers with recent purchases in data/generate_dummy_data.py (seed 42).
# Re-point these when the real dataset replaces the dummy one.
_DEFAULT_SESSIONS = {
    "demo-mx-1": {"customer_id": "CUS00000113", "expires_at": "2099-01-01T00:00:00Z"},
    "demo-co-1": {"customer_id": "CUS00000121", "expires_at": "2099-01-01T00:00:00Z"},
    "demo-ar-1": {"customer_id": "CUS00000452", "expires_at": "2099-01-01T00:00:00Z"},
    "demo-closed": {"customer_id": "CUS00000002", "expires_at": "2099-01-01T00:00:00Z"},  # customer_status=Closed
    "demo-expired": {"customer_id": "CUS00000113", "expires_at": "2020-01-01T00:00:00Z"},
}


@dataclass(frozen=True)
class Session:
    authenticated: bool
    customer_id: str | None = None
    reason: str | None = None  # missing | invalid | expired

    def as_dict(self) -> dict:
        return {"authenticated": self.authenticated, "customer_id": self.customer_id, "reason": self.reason}


def _sessions() -> dict[str, dict]:
    raw = os.getenv("DEMO_SESSIONS_JSON")
    return json.loads(raw) if raw else _DEFAULT_SESSIONS


def resolve_session(custom_inputs: dict | None, now: datetime | None = None) -> Session:
    now = now or datetime.now(timezone.utc)
    token = (custom_inputs or {}).get("session_token") or os.getenv("DEMO_SESSION_TOKEN")
    if not token:
        return Session(False, reason="missing")
    entry = _sessions().get(str(token))
    if not entry:
        return Session(False, reason="invalid")
    expires = datetime.fromisoformat(entry["expires_at"].replace("Z", "+00:00"))
    if expires <= now:
        return Session(False, reason="expired")
    return Session(True, customer_id=entry["customer_id"])
