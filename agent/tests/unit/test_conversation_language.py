from __future__ import annotations

import asyncio

from langchain_core.messages import AIMessage, HumanMessage

import pytest

from src.graph.nodes.classify import classify, conversation_language
from src.schemas.classification import Classification, country_language


class FakeJev:
    def __init__(self, language: str, intent: str):
        self._classification = Classification(
            guardrail="OK",
            guardrail_probability=0.99,
            language=language,
            intent=intent,
            intent_confidence=1.0,
            sentiment="neutral",
            source="jev",
        )

    async def classify(self, text, routes):
        return self._classification


def _classify(
    text: str, jev: FakeJev, previous: dict | None, history: list | None = None, country: str = "México"
) -> dict:
    state = {
        "messages": [*(history or []), HumanMessage(content=text)],
        "classification": previous,
        "session": {"authenticated": True, "customer_id": "CLI-TEST", "country": country},
    }
    return asyncio.run(classify(state, jev, routes=[], threshold=0.5))


def test_cancelar_in_a_spanish_conversation_keeps_spanish():
    history = [HumanMessage(content="Hola"), AIMessage(content="¡Hola! ¿En qué te ayudo?")]
    update = _classify("Cancelar", FakeJev("pt", "CANCEL"), {"language": "es"}, history)
    assert update["classification"]["language"] == "es"


def test_a_clear_portuguese_first_message_is_portuguese():
    update = _classify("Olá, quero ver o meu saldo", FakeJev("pt", "GENERAL_INQUIRY"), None)
    assert update["classification"]["language"] == "pt"


def test_a_longer_message_in_another_language_switches_the_language():
    assert conversation_language("pt", "Quero falar com um atendente", {"language": "es"}, "es") == "pt"


def test_a_previous_other_language_falls_back_to_the_country_language():
    assert conversation_language("es", "Cancelar", {"language": "other"}, "pt") == "pt"


@pytest.mark.parametrize(
    "country, language",
    [("Brasil", "pt"), ("Brazil", "pt"), ("México", "es"), ("Colombia", "es"), (None, "es"), ("Francia", "es")],
)
def test_country_language(country, language):
    assert country_language(country) == language


def test_cancelar_as_first_message_of_a_brazilian_customer_is_portuguese():
    update = _classify("Cancelar", FakeJev("es", "CANCEL"), None, country="Brasil")
    assert update["classification"]["language"] == "pt"


def test_cancelar_as_first_message_of_a_mexican_customer_is_spanish():
    update = _classify("Cancelar", FakeJev("pt", "CANCEL"), None, country="México")
    assert update["classification"]["language"] == "es"


def test_a_short_message_with_a_clear_language_marker_follows_the_detected_language():
    update = _classify("Olá", FakeJev("pt", "GREETING"), None, country="México")
    assert update["classification"]["language"] == "pt"
