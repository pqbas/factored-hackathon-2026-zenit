from __future__ import annotations

import asyncio

from langchain_core.messages import AIMessage, HumanMessage

from src.graph.nodes.classify import classify, conversation_language
from src.schemas.classification import Classification


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


def _classify(text: str, jev: FakeJev, previous: dict | None, history: list | None = None) -> dict:
    state = {"messages": [*(history or []), HumanMessage(content=text)], "classification": previous}
    return asyncio.run(classify(state, jev, routes=[], threshold=0.5))


def test_cancelar_in_a_spanish_conversation_keeps_spanish():
    history = [HumanMessage(content="Hola"), AIMessage(content="¡Hola! ¿En qué te ayudo?")]
    update = _classify("Cancelar", FakeJev("pt", "CANCEL"), {"language": "es"}, history)
    assert update["classification"]["language"] == "es"


def test_a_clear_portuguese_first_message_is_portuguese():
    update = _classify("Olá, quero ver o meu saldo", FakeJev("pt", "GENERAL_INQUIRY"), None)
    assert update["classification"]["language"] == "pt"


def test_a_longer_message_in_another_language_switches_the_language():
    assert conversation_language("pt", "Quero falar com um atendente", {"language": "es"}) == "pt"


def test_a_previous_other_language_does_not_stick():
    assert conversation_language("es", "Cancelar", {"language": "other"}) == "es"
