from __future__ import annotations

import importlib

import src.config as config
from src.db import session_repo


def test_valid_token_returns_authenticated_customer():
    session = session_repo.resolve_session({"session_token": "demo-mx-1"})
    assert session.authenticated is True
    assert session.customer_id == "CLI-FLEUCGTWGAHL"


def test_missing_token_is_rejected_with_reason_missing():
    session = session_repo.resolve_session({})
    assert session.authenticated is False
    assert session.reason == "missing"


def test_unknown_token_is_rejected_with_reason_invalid():
    session = session_repo.resolve_session({"session_token": "not-a-real-token"})
    assert session.authenticated is False
    assert session.reason == "invalid"


def test_expired_token_is_rejected_with_reason_expired():
    session = session_repo.resolve_session({"session_token": "demo-expired"})
    assert session.authenticated is False
    assert session.reason == "expired"


def test_demo_sessions_json_overrides_the_default_fixture(monkeypatch):
    monkeypatch.setenv(
        "DEMO_SESSIONS_JSON",
        '{"tok-1": {"customer_id": "CUS-TEST", "expires_at": "2099-01-01T00:00:00Z"}}',
    )
    importlib.reload(config)
    importlib.reload(session_repo)
    try:
        session = session_repo.resolve_session({"session_token": "tok-1"})
        assert session.authenticated is True
        assert session.customer_id == "CUS-TEST"

        # the default fixture tokens are no longer recognized once the override is set
        default_session = session_repo.resolve_session({"session_token": "demo-mx-1"})
        assert default_session.reason == "invalid"
    finally:
        monkeypatch.undo()
        importlib.reload(config)
        importlib.reload(session_repo)
