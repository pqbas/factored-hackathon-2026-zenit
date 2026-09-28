from __future__ import annotations

import logging
from typing import Any

import httpx

from src.schemas.classification import GUARDRAIL_CATEGORIES, SENTIMENT_LEVELS, Classification
from src.schemas.routing import IntentRoute

logger = logging.getLogger(__name__)


class JevUnavailable(Exception):
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
        self._timeout = timeout
        self._transport = transport  # only set by tests, to inject httpx.MockTransport

    async def classify(self, text: str, routes: list[IntentRoute]) -> Classification:
        body = {
            "model": "jev-latest",
            "state": text,
            "questions": {
                "guardrail": {
                    "type": "choice",
                    "instructions": "Does the customer message violate any of these policies?",
                    "criteria": GUARDRAIL_CATEGORIES,
                },
                "language": {
                    "type": "choice",
                    "instructions": "What language is the customer message written in?",
                    "criteria": {
                        "es": "Spanish.",
                        "pt": "Portuguese.",
                        "other": "Any other language.",
                    },
                },
                "intent": {
                    "type": "choice",
                    "instructions": "What is the customer asking for?",
                    "criteria": {
                        route.intent: f"{route.description} Examples: {'; '.join(route.examples)}"
                        for route in routes
                    },
                },
                "sentiment": {
                    "type": "score",
                    "instructions": "How does the customer sound in this message?",
                    "criteria": SENTIMENT_LEVELS,
                },
            },
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(transport=self._transport, timeout=self._timeout) as client:
                response = await client.post(self._url, json=body, headers=headers)
                response.raise_for_status()
        except httpx.TimeoutException as exc:
            raise JevUnavailable("Jev request timed out") from exc
        except httpx.HTTPStatusError as exc:
            raise JevUnavailable(f"Jev returned status {exc.response.status_code}") from exc
        except httpx.HTTPError as exc:
            raise JevUnavailable("Jev request failed") from exc

        try:
            answers = response.json()["answers"]
            return self._parse(answers)
        except (KeyError, TypeError, ValueError) as exc:
            raise JevUnavailable("Jev returned an incomplete answer") from exc

    @staticmethod
    def _parse(answers: dict[str, Any]) -> Classification:
        guardrail_answer = answers["guardrail"]
        language_answer = answers["language"]
        intent_answer = answers["intent"]
        sentiment_answer = answers["sentiment"]

        raw_guardrail = guardrail_answer["choice"]
        guardrail_probability = guardrail_answer.get("probabilities", {}).get(
            raw_guardrail, guardrail_answer.get("confidence", 0.0)
        )
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
        probabilities = answer.get("probabilities")
        if probabilities:
            best_key = max(probabilities, key=probabilities.get)
            legend = answer.get("legend") or {}
            if best_key in legend:
                return legend[best_key]
            if best_key in SENTIMENT_LEVELS:
                return best_key
            try:
                index = int(best_key)
            except (TypeError, ValueError):
                index = None
            if index is not None and 0 <= index < len(SENTIMENT_LEVELS):
                return SENTIMENT_LEVELS[index]

        score = answer.get("score")
        if score is not None:
            index = max(0, min(len(SENTIMENT_LEVELS) - 1, round(score)))
            return SENTIMENT_LEVELS[index]

        return "neutral"
