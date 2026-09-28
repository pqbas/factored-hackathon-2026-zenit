from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone

from src.config import settings

# Default fixture: real customers of the organizer's dataset (Active, no open cases, recent purchases).
_DEFAULT_SESSIONS = {
    "demo-mx-1": {"customer_id": "CLI-FLEUCGTWGAHL", "country": "México", "expires_at": "2099-01-01T00:00:00Z"},  # Santiago, México, USD
    "demo-co-1": {"customer_id": "CLI-7MPS3ZOPSN4Q", "country": "Colombia", "expires_at": "2099-01-01T00:00:00Z"},  # Javier, Colombia, COP
    "demo-ar-1": {"customer_id": "CLI-714PN0OOE0WX", "country": "Argentina", "expires_at": "2099-01-01T00:00:00Z"},  # Daniela, Argentina, ARS
    "demo-closed": {"customer_id": "CLI-02Y493OHFA18", "country": "Colombia", "expires_at": "2099-01-01T00:00:00Z"},  # customer_status=Closed
    "demo-expired": {"customer_id": "CLI-FLEUCGTWGAHL", "country": "México", "expires_at": "2020-01-01T00:00:00Z"},
}


@dataclass(frozen=True)
class Session:
    authenticated: bool
    customer_id: str | None = None
    country: str | None = None
    reason: str | None = None  # missing | invalid | expired

    def as_dict(self) -> dict:
        return {"authenticated": self.authenticated, "customer_id": self.customer_id,
            "country": self.country,
            "reason": self.reason}


def _sessions() -> dict[str, dict]:
    raw = settings.demo_sessions_json
    return json.loads(raw) if raw else _DEFAULT_SESSIONS


def resolve_session(custom_inputs: dict | None, now: datetime | None = None) -> Session:
    now = now or datetime.now(timezone.utc)
    token = (custom_inputs or {}).get("session_token") or settings.demo_session_token
    if not token:
        return Session(False, reason="missing")
    entry = _sessions().get(str(token))
    if not entry:
        return Session(False, reason="invalid")
    expires = datetime.fromisoformat(entry["expires_at"].replace("Z", "+00:00"))
    if expires <= now:
        return Session(False, reason="expired")
    return Session(True, customer_id=entry["customer_id"], country=entry.get("country"))
