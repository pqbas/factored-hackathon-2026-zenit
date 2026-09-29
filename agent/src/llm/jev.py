from __future__ import annotations

import logging
from typing import Any

import httpx

from src.schemas.classification import (
    GUARDRAIL_CATEGORIES,
    SENTIMENT_LEVELS,
    Classification,
    ClassifierUnavailable,
)
from src.schemas.routing import IntentRoute

logger = logging.getLogger(__name__)


class JevUnavailable(ClassifierUnavailable):
    pass


class JevClient:
    def __init__(
        self,
        api_key: str,
        url: str,
        timeout: float,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self._api_key = api_key
        self._url = url
        # One client for the lifetime of JevClient: a new httpx.AsyncClient per
        # call would pay a fresh TCP+TLS handshake against a 2 s timeout.
        # transport is only set by tests, to inject httpx.MockTransport.
        self._client = httpx.AsyncClient(transport=transport, timeout=timeout)

    async def classify(
        self, text: str, routes: list[IntentRoute], context: str | None = None
    ) -> Classification:
        # With David's previous reply, Jev reads the customer's answer in its context; the
        # questions below always ask about the customer's message only.
        state = f"Asistente: {context}\nCliente: {text}" if context else text
        intent_instructions = "What is the customer asking for?"
        if context:
            intent_instructions += (
                " If the customer's message answers the assistant's previous message (picks an"
                " option, gives the data asked for, or confirms), the intent is the topic of"
                " that exchange: a reason or description given for a cancellation stays"
                " RETENTION even if it mentions fees or charges."
            )
        body = {
            "model": "jev-latest",
            "state": state,
            "questions": {
                "guardrail": {
                    "type": "choice",
                    "instructions": "Does the customer's message violate any of these policies?",
                    "criteria": GUARDRAIL_CATEGORIES,
                },
                "language": {
                    "type": "choice",
                    "instructions": "What language is the customer's message written in?",
                    "criteria": {
                        "es": "Spanish.",
                        "pt": "Portuguese.",
                        "other": "Any other language.",
                    },
                },
                "intent": {
                    "type": "choice",
                    "instructions": intent_instructions,
                    "criteria": {
                        route.intent: f"{route.description} Examples: {'; '.join(route.examples)}"
                        for route in routes
                    },
                },
                "sentiment": {
                    "type": "score",
                    "instructions": "How does the customer sound in their message?",
                    "criteria": SENTIMENT_LEVELS,
                },
            },
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        # The reasons below name the status or exception only: never the customer's text,
        # the response body or the API key.
        try:
            response = await self._client.post(self._url, json=body, headers=headers)
        except httpx.HTTPError as exc:
            raise JevUnavailable(f"request failed: {type(exc).__name__}: {exc}") from exc
        if response.is_error:
            raise JevUnavailable(f"HTTP {response.status_code}")

        try:
            answers = response.json()["answers"]
            return self._parse(answers)
        except (KeyError, TypeError, ValueError) as exc:
            raise JevUnavailable(f"incomplete answer: {type(exc).__name__}: {exc}") from exc

    @staticmethod
    def _parse(answers: dict[str, Any]) -> Classification:
        guardrail_answer = answers["guardrail"]
        language_answer = answers["language"]
        intent_answer = answers["intent"]
        sentiment_answer = answers["sentiment"]

        raw_guardrail = guardrail_answer["choice"]
        guardrail_probability = guardrail_answer["probabilities"][raw_guardrail]
        if raw_guardrail in GUARDRAIL_CATEGORIES:
            guardrail = raw_guardrail
        else:
            logger.warning("Jev returned unknown guardrail category %r; treating as OK", raw_guardrail)
            guardrail = "OK"

        return Classification(
            guardrail=guardrail,
            guardrail_probability=guardrail_probability,
            language=language_answer["choice"],
            intent=intent_answer["choice"],
            intent_confidence=intent_answer["confidence"],
            sentiment=JevClient._sentiment_label(sentiment_answer),
            source="jev",
        )

    @staticmethod
    def _sentiment_label(answer: dict[str, Any]) -> str:
        # docs.typesafe.ai/api.md: a score answer's "probabilities" and "legend"
        # share the same level keys, so the legend resolves the winning level.
        probabilities = answer["probabilities"]
        legend = answer["legend"]
        best_key = max(probabilities, key=probabilities.get)
        return legend[best_key]
