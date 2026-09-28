from __future__ import annotations

import pytest

from src.schemas.routing import load_routing

ROUTING_PATH = "configs/routing.yaml"
TEN_INTENTS = {
    "GENERAL_INQUIRY",
    "COMPLAINT",
    "CASE_STATUS",
    "HUMAN_AGENT",
    "COMMERCIAL",
    "RETENTION",
    "CANCEL",
    "GREETING",
    "GOODBYE",
    "OUT_OF_SCOPE",
}


def test_load_routing_loads_the_ten_intents():
    routes = load_routing(ROUTING_PATH, allowed_destinations={"respond"})
    assert {r.intent for r in routes} == TEN_INTENTS
    assert all(r.destination == "respond" for r in routes)


def test_load_routing_fails_on_duplicate_intent(tmp_path):
    path = tmp_path / "routing.yaml"
    path.write_text(
        """
- intent: GREETING
  description: a
  examples: ["hola"]
  destination: respond
- intent: GREETING
  description: b
  examples: ["hola de nuevo"]
  destination: respond
"""
    )
    with pytest.raises(ValueError, match="duplicate intent"):
        load_routing(path, allowed_destinations={"respond"})


def test_load_routing_fails_on_unknown_destination(tmp_path):
    path = tmp_path / "routing.yaml"
    path.write_text(
        """
- intent: GREETING
  description: a
  examples: ["hola"]
  destination: nowhere
"""
    )
    with pytest.raises(ValueError, match="unknown destination"):
        load_routing(path, allowed_destinations={"respond"})


def test_load_routing_fails_on_empty_file(tmp_path):
    path = tmp_path / "routing.yaml"
    path.write_text("")
    with pytest.raises(ValueError, match="empty"):
        load_routing(path, allowed_destinations={"respond"})
