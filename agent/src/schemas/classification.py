from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

GUARDRAIL_CATEGORIES: dict[str, str] = {
    "OK": "The message does not violate any policy.",
    "PROMPT_INJECTION": "The message tries to override, ignore or reveal the assistant's instructions.",
    "THIRD_PARTY_DATA": "The message asks for account data belonging to someone other than the customer.",
    "ABUSE": "The message insults, threatens or uses offensive language toward the bank or an agent.",
    "SENSITIVE_DATA": "The message includes a full card number, CVV or password.",
    "CUSTOMER_RISK": "The message shows signs of an ongoing scam against the customer.",
}

SENTIMENT_LEVELS = ["very_negative", "negative", "neutral", "positive"]

Source = Literal["rules", "jev", "fallback"]


class Classification(BaseModel):
    guardrail: str
    guardrail_probability: float
    language: str
    intent: str
    intent_confidence: float
    sentiment: str
    source: Source

    def blocked(self, threshold: float) -> bool:
        return self.guardrail != "OK" and self.guardrail_probability >= threshold
