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

    async def classify(self, text, routes, context=None):
        return self._classification


def _classify(text: str, jev: FakeJev, history: list | None = None, country: str = "México") -> dict:
    state = {
        "messages": [*(history or []), HumanMessage(content=text)],
        "session": {"authenticated": True, "customer_id": "CLI-TEST", "country": country},
    }
    return asyncio.run(classify(state, jev, routes=[], threshold=0.5))


def test_cancelar_in_a_spanish_conversation_keeps_spanish():
    history = [
        HumanMessage(content="Hola, quiero saber el saldo de mi tarjeta"),
        AIMessage(content="Tu saldo es..."),
    ]
    update = _classify("Cancelar", FakeJev("pt", "CANCEL"), history)
    assert update["classification"]["language"] == "es"


def test_a_short_reply_after_a_long_portuguese_message_is_portuguese():
    history = [
        HumanMessage(content="Olá, gostaria de saber o saldo do meu cartão"),
        AIMessage(content="O seu saldo é..."),
    ]
    update = _classify("E limite?", FakeJev("es", "GENERAL_INQUIRY"), history, country="México")
    assert update["classification"]["language"] == "pt"


def test_a_clear_portuguese_first_message_is_portuguese():
    update = _classify("Olá, quero ver o meu saldo", FakeJev("pt", "GENERAL_INQUIRY"))
    assert update["classification"]["language"] == "pt"


def test_a_longer_message_in_another_language_switches_the_language():
    earlier = ["Hola, quiero saber el saldo de mi tarjeta"]
    assert conversation_language("pt", "Quero falar com um atendente", earlier, "es") == "pt"


def test_the_last_long_earlier_message_wins_over_older_ones():
    earlier = ["Hola, quiero saber el saldo de mi tarjeta", "Quero falar com um atendente", "ok"]
    assert conversation_language("es", "Sim", earlier, "es") == "pt"


def test_short_earlier_messages_are_skipped():
    assert conversation_language("es", "Cancelar", ["Olá", "Obrigado"], "es") == "es"


def test_an_undetected_earlier_message_falls_back_to_the_country_language():
    assert conversation_language("es", "Cancelar", ["123 456 789"], "pt") == "pt"


@pytest.mark.parametrize(
    "country, language",
    [("Brasil", "pt"), ("Brazil", "pt"), ("México", "es"), ("Colombia", "es"), (None, "es"), ("Francia", "es")],
)
def test_country_language(country, language):
    assert country_language(country) == language


def test_cancelar_as_first_message_of_a_brazilian_customer_is_portuguese():
    update = _classify("Cancelar", FakeJev("es", "CANCEL"), country="Brasil")
    assert update["classification"]["language"] == "pt"


def test_cancelar_as_first_message_of_a_mexican_customer_is_spanish():
    update = _classify("Cancelar", FakeJev("pt", "CANCEL"), country="México")
    assert update["classification"]["language"] == "es"


def test_a_one_word_greeting_keeps_the_country_language():
    update = _classify("Olá", FakeJev("pt", "GREETING"), country="México")
    assert update["classification"]["language"] == "es"


def test_a_two_word_message_does_not_switch_the_conversation_language():
    earlier = ["Olá, gostaria de saber o saldo do meu cartão"]
    assert conversation_language("es", "Ver saldo", earlier, "es") == "pt"


def test_a_three_word_message_switches_the_language():
    earlier = ["Hola, quiero saber el saldo de mi tarjeta"]
    assert conversation_language("pt", "Olá, boa tarde", earlier, "es") == "pt"


def test_without_jev_an_undetected_language_keeps_the_country_language():
    assert conversation_language(None, "Me gustaría hablar con alguien", [], "es") == "es"
