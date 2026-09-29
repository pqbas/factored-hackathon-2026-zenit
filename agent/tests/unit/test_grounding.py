from __future__ import annotations

import pytest

from src.graph.build import GRAPH_NODES
from src.schemas.routing import load_routing
from src.tools.grounding import required_kinds, ungrounded

ROUTES = {route.intent: route for route in load_routing("configs/routing.yaml", GRAPH_NODES)}
INQUIRY = ROUTES["GENERAL_INQUIRY"]
CASE_STATUS = ROUTES["CASE_STATUS"]

MOVEMENTS = "Tus últimos movimientos:\n- 26/02/2026 Tienda X 443.88 USD Aprobado\n- 25/02/2026 Cafe Y 12.50 USD Aprobado"
BALANCE = "Tarjeta 1234: saldo 1,250.40 USD, límite 5,000.00 USD, cupo disponible 3,749.60 USD."


def _kinds(route, customer, reply="") -> list[str]:
    return [kind.kind for kind in required_kinds(route, customer, reply)]


def test_the_customers_words_pick_the_kinds():
    assert _kinds(INQUIRY, "muéstrame mis movimientos") == ["movements"]
    assert _kinds(INQUIRY, "minhas movimentações") == ["movements"]
    assert _kinds(INQUIRY, "¿cuál es mi saldo?") == ["balance"]
    assert _kinds(INQUIRY, "saldo y movimientos") == ["movements", "balance"]
    assert _kinds(CASE_STATUS, "¿cómo va mi reclamo?") == ["status"]


def test_without_a_match_the_reply_picks_the_first_kind_it_shows():
    assert _kinds(INQUIRY, "la de 1234", MOVEMENTS) == ["movements"]
    assert _kinds(INQUIRY, "la de 1234", BALANCE) == ["balance"]
    assert _kinds(INQUIRY, "1", "¿Qué quieres ver?") == []


def test_movements_without_list_transactions_fire():
    missing = ungrounded(INQUIRY, "soy Eduardo, muéstrame mis movimientos", MOVEMENTS, {"get_products"})
    assert missing is not None and missing.tool == "list_transactions"


def test_movements_with_list_transactions_do_not_fire():
    assert ungrounded(INQUIRY, "mis movimientos", MOVEMENTS, {"get_products", "list_transactions"}) is None
    assert ungrounded(INQUIRY, "la de 1234", MOVEMENTS, {"list_transactions"}) is None


def test_a_balance_with_get_products_does_not_fire_and_without_it_does():
    assert ungrounded(INQUIRY, "¿cuál es mi saldo?", BALANCE, {"get_products"}) is None
    missing = ungrounded(INQUIRY, "¿cuál es mi saldo?", BALANCE, set())
    assert missing is not None and missing.tool == "get_products"


@pytest.mark.parametrize("reply", [
    "¿De cuál tarjeta? Tienes la terminada en 1234 y la terminada en 5678.",
    "Ahora no puedo consultar esa información.",
    "Elige una opción: 1) saldo, límite y cupo, 2) movimientos.",
    "No tienes una tarjeta de crédito activa.",
])
def test_replies_without_figures_never_fire(reply):
    assert ungrounded(INQUIRY, "mis movimientos", reply, set()) is None
    assert ungrounded(INQUIRY, "¿cuál es mi saldo?", reply, set()) is None


def test_a_case_date_without_get_cases_fires():
    reply = "¿Es el reclamo por cargo no reconocido del 09/10/2025?"
    missing = ungrounded(CASE_STATUS, "¿cómo va mi reclamo?", reply, {"get_products"})
    assert missing is not None and missing.tool == "get_cases"
    assert ungrounded(CASE_STATUS, "¿cómo va mi reclamo?", reply, {"get_cases"}) is None
    assert ungrounded(CASE_STATUS, "¿cómo va mi reclamo?", "Tu reclamo está abierto.", set()) is None
