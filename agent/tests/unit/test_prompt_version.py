from __future__ import annotations

import re

from src.prompts import version


def test_prompt_version_is_12_hex_characters_and_stable():
    first = version.prompt_version()
    assert re.fullmatch(r"[0-9a-f]{12}", first)
    assert version.prompt_version() == first


def test_prompt_version_changes_when_a_prompt_file_changes(tmp_path, monkeypatch):
    routing = tmp_path / "routing.yaml"
    routing.write_text("a")
    monkeypatch.setattr(version, "settings", type("S", (), {"routing_path": str(routing)})())
    version.prompt_version.cache_clear()
    try:
        before = version.prompt_version()
        routing.write_text("b")
        version.prompt_version.cache_clear()
        assert version.prompt_version() != before
    finally:
        version.prompt_version.cache_clear()
