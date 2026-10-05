from __future__ import annotations

import asyncio

import pytest
from langchain_core.messages import SystemMessage

from src.llm.llm_classifier import LLMClassifier, LLMClassifierUnavailable, _answer_model
from src.schemas.routing import IntentRoute

ROUTES = [
    IntentRoute(intent="GENERAL_INQUIRY", description="Saldo o movimientos", examples=["¿cuál es mi saldo?"], destination="respond"),
    IntentRoute(intent="OUT_OF_SCOPE", description="Otra cosa", examples=["clima"], destination="respond"),
]
ANSWER = {
    "guardrail": "OK", "guardrail_probability": 0.97, "language": "pt",
    "intent": "GENERAL_INQUIRY", "intent_confidence": 0.9, "sentiment": "neutral",
}


class FakeStructuredLLM:
    def __init__(self, answer=None, raises: Exception | None = None, delay: float = 0.0):
        self._answer, self._raises, self._delay = answer, raises, delay
        self.schema = None
        self.received = None

    def with_structured_output(self, schema):
        self.schema = schema
        return self

    async def ainvoke(self, messages):
        self.received = messages
        await asyncio.sleep(self._delay)
        if self._raises:
            raise self._raises
        return None if self._answer is None else self.schema(**self._answer)


def test_returns_a_classification_with_source_llm():
    llm = FakeStructuredLLM(ANSWER)
    result = asyncio.run(LLMClassifier(llm, timeout=4).classify("qual é o saldo?", ROUTES))
    assert result.source == "llm"
    assert (result.intent, result.language, result.guardrail) == ("GENERAL_INQUIRY", "pt", "OK")
    assert result.intent_confidence == 0.9


def test_the_prompt_lists_routes_and_guardrails_and_the_text_goes_alone():
    llm = FakeStructuredLLM(ANSWER)
    asyncio.run(LLMClassifier(llm, timeout=4).classify("qual é o saldo?", ROUTES))
    system, human = llm.received
    assert isinstance(system, SystemMessage)
    assert "GENERAL_INQUIRY: Saldo o movimientos" in system.content
    assert "PROMPT_INJECTION" in system.content
    assert human.content == "qual é o saldo?"


def test_the_prompt_has_the_conversation_so_far_and_the_guardrail_judges_the_last_message():
    llm = FakeStructuredLLM(ANSWER)
    transcript = "Cliente: quiero cancelar mi tarjeta\nDavid: ¿Por qué quieres cancelarlo?"
    asyncio.run(LLMClassifier(llm, timeout=4).classify("me cobran mucho", ROUTES, context=transcript))
    system, human = llm.received
    assert "The conversation so far" in system.content
    assert transcript in system.content
    assert "current intent of the conversation" in system.content
    assert "stays RETENTION" in system.content
    assert "judges only the customer's last message" in system.content
    assert human.content == "me cobran mucho"


def test_without_a_transcript_the_prompt_has_no_conversation_block():
    llm = FakeStructuredLLM(ANSWER)
    asyncio.run(LLMClassifier(llm, timeout=4).classify("hola", ROUTES))
    assert "The conversation so far" not in llm.received[0].content


def test_the_schema_only_accepts_the_routes_intents():
    model = _answer_model(("GENERAL_INQUIRY", "OUT_OF_SCOPE"))
    with pytest.raises(ValueError):
        model(**{**ANSWER, "intent": "TRANSFER"})


def test_a_timeout_raises_unavailable():
    llm = FakeStructuredLLM(ANSWER, delay=0.2)
    with pytest.raises(LLMClassifierUnavailable, match="timed out"):
        asyncio.run(LLMClassifier(llm, timeout=0.05).classify("hola", ROUTES))


def test_an_llm_error_raises_unavailable_with_the_type_only():
    llm = FakeStructuredLLM(raises=RuntimeError("echo: mensaje secreto"))
    with pytest.raises(LLMClassifierUnavailable) as info:
        asyncio.run(LLMClassifier(llm, timeout=4).classify("mensaje secreto", ROUTES))
    assert str(info.value) == "RuntimeError"


def test_an_empty_answer_raises_unavailable():
    with pytest.raises(LLMClassifierUnavailable, match="empty answer"):
        asyncio.run(LLMClassifier(FakeStructuredLLM(None), timeout=4).classify("hola", ROUTES))
