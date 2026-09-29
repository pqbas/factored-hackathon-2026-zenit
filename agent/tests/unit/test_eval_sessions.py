from __future__ import annotations

import json
from pathlib import Path

_FILE = Path(__file__).resolve().parents[2] / "configs" / "eval_sessions.json"

_TOKENS = {
    "demo-mx-1", "demo-mx-2", "demo-mx-3", "demo-mx-4", "demo-mx-5",
    "demo-co-1", "demo-co-2", "demo-co-3", "demo-co-4",
    "demo-ar-1", "demo-ar-2", "demo-ar-3", "demo-ar-4",
    "demo-expired", "demo-tool-down",
}


def test_the_sessions_file_has_the_15_tokens_of_the_cases():
    assert set(json.loads(_FILE.read_text())) == _TOKENS


def test_only_demo_expired_is_expired_and_only_demo_tool_down_fails_tools():
    sessions = json.loads(_FILE.read_text())
    assert [t for t, e in sessions.items() if e["expires_at"].startswith("2020")] == ["demo-expired"]
    assert [t for t, e in sessions.items() if e.get("fail_tools")] == ["demo-tool-down"]
    assert sessions["demo-tool-down"]["fail_tools"] == ["get_products"]


def test_the_file_agrees_with_the_default_sessions_on_the_shared_tokens():
    from src.db.session_repo import _DEFAULT_SESSIONS

    sessions = json.loads(_FILE.read_text())
    for token, entry in _DEFAULT_SESSIONS.items():
        if token in sessions:
            assert sessions[token]["customer_id"] == entry["customer_id"]
