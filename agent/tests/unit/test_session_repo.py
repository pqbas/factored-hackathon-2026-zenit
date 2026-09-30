from __future__ import annotations

import asyncio
import importlib

import src.config as config
from src.db import session_repo


def test_valid_token_returns_authenticated_customer():
    session = asyncio.run(session_repo.resolve_session({"session_token": "demo-mx-1"}))
    assert session.authenticated is True
    assert session.customer_id == "CLI-FLEUCGTWGAHL"


def test_missing_token_is_rejected_with_reason_missing():
    session = asyncio.run(session_repo.resolve_session({}))
    assert session.authenticated is False
    assert session.reason == "missing"


def test_missing_token_is_rejected_even_with_demo_session_token_set(monkeypatch):
    # A leftover DEMO_SESSION_TOKEN in the environment must not act as a default identity.
    monkeypatch.setenv("DEMO_SESSION_TOKEN", "demo-mx-1")
    importlib.reload(config)
    importlib.reload(session_repo)
    try:
        session = asyncio.run(session_repo.resolve_session(None))
        assert session.authenticated is False
        assert session.reason == "missing"
    finally:
        monkeypatch.undo()
        importlib.reload(config)
        importlib.reload(session_repo)


def test_unknown_token_is_rejected_with_reason_invalid():
    session = asyncio.run(session_repo.resolve_session({"session_token": "not-a-real-token"}))
    assert session.authenticated is False
    assert session.reason == "invalid"


def test_expired_token_is_rejected_with_reason_expired():
    session = asyncio.run(session_repo.resolve_session({"session_token": "demo-expired"}))
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
        session = asyncio.run(session_repo.resolve_session({"session_token": "tok-1"}))
        assert session.authenticated is True
        assert session.customer_id == "CUS-TEST"

        # the default fixture tokens are no longer recognized once the override is set
        default_session = asyncio.run(session_repo.resolve_session({"session_token": "demo-mx-1"}))
        assert default_session.reason == "invalid"
    finally:
        monkeypatch.undo()
        importlib.reload(config)
        importlib.reload(session_repo)


def test_demo_session_exposes_the_customers_country():
    session = asyncio.run(session_repo.resolve_session({"session_token": "demo-mx-1"}))
    assert session.country == "México"
    assert session.as_dict()["country"] == "México"


def test_a_session_entry_can_list_the_tools_that_fail(monkeypatch):
    monkeypatch.setenv(
        "DEMO_SESSIONS_JSON",
        '{"tok-1": {"customer_id": "C", "expires_at": "2099-01-01T00:00:00Z", "fail_tools": ["get_products"]},'
        ' "tok-2": {"customer_id": "C", "expires_at": "2099-01-01T00:00:00Z"}}',
    )
    importlib.reload(config)
    importlib.reload(session_repo)
    try:
        failing = asyncio.run(session_repo.resolve_session({"session_token": "tok-1"}))
        assert failing.fail_tools == ("get_products",)
        assert failing.as_dict()["fail_tools"] == ["get_products"]
        assert asyncio.run(session_repo.resolve_session({"session_token": "tok-2"})).fail_tools == ()
    finally:
        monkeypatch.undo()
        importlib.reload(config)
        importlib.reload(session_repo)


# --- Simulated sessions (sim- tokens) looked up in Lakebase ---------------------------------

from datetime import datetime, timedelta, timezone  # noqa: E402

from psycopg_pool import PoolTimeout  # noqa: E402

from lakebase_fakes import FakePool  # noqa: E402

_NOW = datetime(2026, 9, 30, 12, 0, tzinfo=timezone.utc)
_SIM = "sim-89c98277-a0f7-4d71-a4ca-def80715b858"


def _sim_pool(expires_at, error=None):
    return FakePool(error=error, sim_sessions={
        _SIM: {"customer_id": "CLI-8WQ0WQXUM9LD", "country": "Colombia", "expires_at": expires_at},
    })


def _resolve(token, pool):
    return asyncio.run(session_repo.resolve_session({"session_token": token}, now=_NOW, pool=pool))


def test_a_valid_sim_token_resolves_to_its_customer():
    session = _resolve(_SIM, _sim_pool(_NOW + timedelta(hours=1)))
    assert session.authenticated is True
    assert session.customer_id == "CLI-8WQ0WQXUM9LD"
    assert session.country == "Colombia"


def test_an_expired_sim_token_is_rejected_as_expired():
    session = _resolve(_SIM, _sim_pool(_NOW - timedelta(minutes=1)))
    assert (session.authenticated, session.reason) == (False, "expired")


def test_an_unknown_sim_token_is_rejected_as_invalid():
    session = _resolve("sim-00000000-0000-4000-8000-000000000000", _sim_pool(_NOW + timedelta(hours=1)))
    assert (session.authenticated, session.reason) == (False, "invalid")


def test_lakebase_down_fails_closed_and_never_logs_the_token(caplog):
    pool = _sim_pool(_NOW + timedelta(hours=1), error=PoolTimeout("couldn't get a connection after 5.00 sec"))
    with caplog.at_level("DEBUG"):
        session = _resolve(_SIM, pool)
    assert (session.authenticated, session.reason) == (False, "invalid")
    assert "PoolTimeout" in caplog.text
    assert _SIM not in caplog.text and "89c98277" not in caplog.text


def test_the_lookup_is_one_parameterized_query():
    pool = _sim_pool(_NOW + timedelta(hours=1))
    _resolve(_SIM, pool)
    [(query, params)] = pool.queries
    assert query == "SELECT customer_id, country, expires_at FROM bank_sessions.sim_sessions WHERE token = %(token)s"
    assert params == {"token": _SIM}


def test_demo_and_other_tokens_never_touch_lakebase():
    pool = _sim_pool(_NOW + timedelta(hours=1))
    assert _resolve("demo-mx-1", pool).authenticated is True
    assert _resolve("not-a-sim-token", pool).reason == "invalid"
    assert pool.queries == []
