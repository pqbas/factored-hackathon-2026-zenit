from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from src.llm.jev import JevClient, JevUnavailable
from src.schemas.routing import IntentRoute

ROUTES = [
    IntentRoute(
        intent="GENERAL_INQUIRY",
        description="El cliente pregunta por su saldo.",
        examples=["¿cuál es mi saldo?"],
        destination="respond",
    ),
    IntentRoute(
        intent="COMPLAINT",
        description="El cliente reclama por un cobro.",
        examples=["no reconozco un cargo"],
        destination="respond",
    ),
]


def _sample_response_body():
    return {
        "model": "jev-1.0",
        "answers": {
            "guardrail": {
                "type": "choice",
                "choice": "OK",
                "confidence": 0.95,
                "probabilities": {"OK": 0.95, "PROMPT_INJECTION": 0.05},
            },
            "language": {
                "type": "choice",
                "choice": "es",
                "confidence": 0.99,
                "probabilities": {"es": 0.99, "pt": 0.01, "other": 0.0},
            },
            "intent": {
                "type": "choice",
                "choice": "GENERAL_INQUIRY",
                "confidence": 0.87,
                "probabilities": {"GENERAL_INQUIRY": 0.87, "COMPLAINT": 0.13},
            },
            "sentiment": {
                "type": "score",
                "score": 2.1,
                "confidence": 0.8,
                "probabilities": {"0": 0.05, "1": 0.1, "2": 0.6, "3": 0.25},
                "legend": {"0": "very_negative", "1": "negative", "2": "neutral", "3": "positive"},
            },
        },
        "usage": {"tokens": 42},
    }


def _client_with_handler(handler) -> JevClient:
    return JevClient(
        api_key="test-key", url="https://api.typesafe.ai/v1/systemone", timeout=2.0,
        transport=httpx.MockTransport(handler),
    )


def test_request_sends_four_questions_bearer_key_and_intent_criteria():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["auth"] = request.headers.get("authorization")
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json=_sample_response_body())

    client = _client_with_handler(handler)
    asyncio.run(client.classify("hola", ROUTES))

    assert captured["auth"] == "Bearer test-key"
    body = captured["body"]
    assert body["model"] == "jev-latest"
    assert body["state"] == "hola"
    questions = body["questions"]
    assert set(questions) == {"guardrail", "language", "intent", "sentiment"}
    assert set(questions["intent"]["criteria"]) == {"GENERAL_INQUIRY", "COMPLAINT"}
    assert "saldo" in questions["intent"]["criteria"]["GENERAL_INQUIRY"]


def test_sample_response_parses_to_classification():
    client = _client_with_handler(lambda r: httpx.Response(200, json=_sample_response_body()))
    result = asyncio.run(client.classify("hola", ROUTES))

    assert result.source == "jev"
    assert result.guardrail == "OK"
    assert result.guardrail_probability == 0.95
    assert result.language == "es"
    assert result.intent == "GENERAL_INQUIRY"
    assert result.intent_confidence == 0.87
    assert result.sentiment == "neutral"  # probability 0.6, the highest


def test_unknown_guardrail_category_maps_to_ok():
    body = _sample_response_body()
    body["answers"]["guardrail"] = {
        "type": "choice", "choice": "SOMETHING_NEW", "confidence": 0.7,
        "probabilities": {"SOMETHING_NEW": 0.7},
    }
    client = _client_with_handler(lambda r: httpx.Response(200, json=body))
    result = asyncio.run(client.classify("hola", ROUTES))
    assert result.guardrail == "OK"


def test_timeout_raises_jev_unavailable():
    def handler(request: httpx.Request):
        raise httpx.ReadTimeout("timed out", request=request)

    client = _client_with_handler(handler)
    with pytest.raises(JevUnavailable, match="request failed: ReadTimeout: timed out"):
        asyncio.run(client.classify("hola", ROUTES))


def test_529_raises_jev_unavailable_with_the_status():
    client = _client_with_handler(lambda r: httpx.Response(529, json={"error": "overloaded"}))
    with pytest.raises(JevUnavailable, match="^HTTP 529$"):
        asyncio.run(client.classify("hola", ROUTES))


def test_unavailable_reason_never_carries_the_text_or_the_key():
    client = _client_with_handler(lambda r: httpx.Response(401, text="bad key for mensaje secreto"))
    with pytest.raises(JevUnavailable) as info:
        asyncio.run(client.classify("mensaje secreto", ROUTES))
    assert "mensaje secreto" not in str(info.value)
    assert client._api_key not in str(info.value)


def test_reuses_a_single_http_client_across_calls():
    client = _client_with_handler(lambda r: httpx.Response(200, json=_sample_response_body()))
    http_client = client._client
    asyncio.run(client.classify("hola", ROUTES))
    asyncio.run(client.classify("otro mensaje", ROUTES))
    assert client._client is http_client


def test_missing_probability_for_the_chosen_guardrail_raises_jev_unavailable():
    body = _sample_response_body()
    body["answers"]["guardrail"] = {
        "type": "choice", "choice": "OK", "confidence": 0.95, "probabilities": {},
    }
    client = _client_with_handler(lambda r: httpx.Response(200, json=body))
    with pytest.raises(JevUnavailable, match="incomplete answer: KeyError"):
        asyncio.run(client.classify("hola", ROUTES))
