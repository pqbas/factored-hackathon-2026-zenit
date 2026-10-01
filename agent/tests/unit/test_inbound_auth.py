from __future__ import annotations

import pytest

from src.config import Settings
from src.inbound_auth import token_ok


@pytest.mark.parametrize("received, ok", [("s3cret", True), ("s3creT", False), ("s3cret ", False), ("", False), (None, False)])
def test_token_ok_only_for_the_exact_token(received, ok):
    assert token_ok("s3cret", received) is ok


@pytest.mark.parametrize("value, token", [(None, None), ("", None), ("abc", "abc")])
def test_agent_token_setting(monkeypatch, value, token):
    if value is None:
        monkeypatch.delenv("AGENT_TOKEN", raising=False)
    else:
        monkeypatch.setenv("AGENT_TOKEN", value)
    assert Settings.from_env().agent_token == token
