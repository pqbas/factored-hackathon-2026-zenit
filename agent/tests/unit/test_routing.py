from __future__ import annotations

import pytest

from src.schemas.routing import IntentRoute, load_routing, render_options

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
    assert by_intent["GENERAL_INQUIRY"] == "load_context"
    assert all(
        dest == "respond" for intent, dest in by_intent.items() if intent not in ("CANCEL", "GENERAL_INQUIRY")
    )


def test_load_routing_loads_the_option_field():
    routes = load_routing(ROUTING_PATH, allowed_destinations=GRAPH_NODES)
    by_intent = {r.intent: r for r in routes}
    assert by_intent["GENERAL_INQUIRY"].option["es"] == (
        "Consultar el saldo, el límite o los movimientos de tu tarjeta o cuenta"
    )
    assert by_intent["GENERAL_INQUIRY"].option["pt"] == (
        "Consultar o saldo, o limite ou as movimentações do seu cartão ou conta"
    )
    assert by_intent["GREETING"].option is None


def test_load_routing_loads_schemas_and_instructions_for_general_inquiry():
    routes = load_routing(ROUTING_PATH, allowed_destinations=GRAPH_NODES)
    by_intent = {r.intent: r for r in routes}
    assert by_intent["GENERAL_INQUIRY"].schemas == ["bank_uc_consultas"]
    assert "get_products" in by_intent["GENERAL_INQUIRY"].instructions
    assert by_intent["COMPLAINT"].schemas == []
    assert by_intent["COMPLAINT"].instructions is None


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


def test_load_routing_fails_on_an_option_missing_pt(tmp_path):
    path = tmp_path / "routing.yaml"
    path.write_text(
        """
- intent: GREETING
  description: a
  examples: ["hola"]
  destination: respond
  option:
    es: "Saludar"
"""
    )
    with pytest.raises(ValueError, match="option"):
        load_routing(path, allowed_destinations=GRAPH_NODES)


def test_render_options_lists_options_in_order_in_es_and_pt():
    routes = [
        IntentRoute(
            intent="A", description="d", examples=["e"], destination="respond",
            option={"es": "Uno", "pt": "Um"},
        ),
        IntentRoute(
            intent="B", description="d", examples=["e"], destination="respond",
            option={"es": "Dos", "pt": "Dois"},
        ),
        IntentRoute(intent="C", description="d", examples=["e"], destination="respond"),
    ]
    assert render_options(routes, "es") == "1. Uno\n2. Dos"
    assert render_options(routes, "pt") == "1. Um\n2. Dois"


def test_render_options_falls_back_to_es_for_other():
    routes = [
        IntentRoute(
            intent="A", description="d", examples=["e"], destination="respond",
            option={"es": "Uno", "pt": "Um"},
        ),
    ]
    assert render_options(routes, "other") == "1. Uno"


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
