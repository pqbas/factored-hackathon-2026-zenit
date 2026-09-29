from __future__ import annotations

import pytest

from src.schemas.routing import load_routing

ROUTING_PATH = "configs/routing.yaml"
GRAPH_NODES = {"respond", "cancel", "load_context"}
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
    routes = load_routing(ROUTING_PATH, allowed_destinations=GRAPH_NODES)
    assert {r.intent for r in routes} == TEN_INTENTS
    by_intent = {r.intent: r.destination for r in routes}
    assert by_intent["CANCEL"] == "cancel"
    use_cases = ("GENERAL_INQUIRY", "COMPLAINT", "RETENTION")
    assert all(by_intent[intent] == "load_context" for intent in use_cases)
    assert all(
        dest == "respond" for intent, dest in by_intent.items() if intent not in ("CANCEL", *use_cases)
    )


def test_load_routing_loads_schemas_and_instructions_for_general_inquiry():
    routes = load_routing(ROUTING_PATH, allowed_destinations=GRAPH_NODES)
    by_intent = {r.intent: r for r in routes}
    assert by_intent["GENERAL_INQUIRY"].schemas == ["bank_uc_consultas"]
    assert "get_products" in by_intent["GENERAL_INQUIRY"].instructions
    assert by_intent["COMPLAINT"].handoff_reason == "complaint"
    assert by_intent["RETENTION"].handoff_reason == "retention"
    assert by_intent["GENERAL_INQUIRY"].handoff_reason is None


def test_load_routing_fails_on_a_load_context_route_without_schemas(tmp_path):
    path = tmp_path / "routing.yaml"
    path.write_text(
        """
- intent: GENERAL_INQUIRY
  description: a
  examples: ["saldo"]
  destination: load_context
  instructions: "usa get_products"
"""
    )
    with pytest.raises(ValueError, match="schemas"):
        load_routing(path, allowed_destinations=GRAPH_NODES)


def test_load_routing_fails_on_a_load_context_route_without_instructions(tmp_path):
    path = tmp_path / "routing.yaml"
    path.write_text(
        """
- intent: GENERAL_INQUIRY
  description: a
  examples: ["saldo"]
  destination: load_context
  schemas: [bank_uc_consultas]
"""
    )
    with pytest.raises(ValueError, match="instructions"):
        load_routing(path, allowed_destinations=GRAPH_NODES)


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
