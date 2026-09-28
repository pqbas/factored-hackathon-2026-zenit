from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable

from src.schemas.classification import Classification


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    return "".join(ch for ch in text if not unicodedata.combining(ch))


_PT_MARKERS = re.compile(
    r"\b(nao|voce|obrigad[oa]|cobranca|reconheco|estorno|compra que nao|minha|meu|cartao|"
    r"ontem|hoje|atendente|sim|oi|ola|valor|nenhum[a]?)\b"
)
_ES_MARKERS = re.compile(
    r"\b(no reconozco|yo|mi|tarjeta|cargo|cobro|ayer|hoy|asesor|si|hola|monto|ninguno|"
    r"gracias|quiero|compra que no)\b"
)


def detect_language(text: str) -> str:
    t = normalize(text)
    pt, es = len(_PT_MARKERS.findall(t)), len(_ES_MARKERS.findall(t))
    if pt > es:
        return "pt"
    if es > pt:
        return "es"
    return "other"


# --- Guardrail rules -------------------------------------------------------

_INJECTION = re.compile(
    r"(ignora (tus|las) (instrucciones|reglas)|ignore (your |all |previous )?instructions|"
    r"olvida (tus|las) (instrucciones|reglas)|disregard (your |all |previous )?instructions|"
    r"ignore (suas|as) (instrucoes|regras)|esqueca (suas|as) (instrucoes|regras))"
)

_CARD_CANDIDATE = re.compile(r"(?:\d[ -]?){13,19}")
_CVV_OR_PASSWORD = re.compile(
    r"\b(cvv|contrase[ñn]a|senha)\b\s*(?:es|é|:|=)?\s*(\S*\d\S*)", re.IGNORECASE
)


def _luhn_valid(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def _find_card_number(text: str) -> str | None:
    for m in _CARD_CANDIDATE.finditer(text):
        digits = re.sub(r"[ -]", "", m.group(0))
        if 13 <= len(digits) <= 19 and _luhn_valid(digits):
            # The pattern may swallow a trailing separator; keep it out of the masked span.
            return m.group(0).rstrip(" -")
    return None


def mask_sensitive(text: str) -> str:
    """Replaces every card number and every CVV or password value in the text."""
    while card := _find_card_number(text):
        text = text.replace(card, "[NÚMERO OCULTO]")
    return _CVV_OR_PASSWORD.sub("[DATO OCULTO]", text)


def check_guardrail_rules(text: str) -> tuple[str, str] | None:
    """Cheap, no-network checks that run before Jev. Returns (category, masked_text)."""
    if _INJECTION.search(normalize(text)):
        return "PROMPT_INJECTION", text

    masked = mask_sensitive(text)
    if masked != text:
        return "SENSITIVE_DATA", masked

    return None


# --- Fallback intent classification -----------------------------------------
# Ported from legacy/agent_server/dispute/nlu.py::baseline_understand.

_CANCEL = re.compile(r"^\s*(cancelar|cancela|cancelo|olvidalo|deixa pra la|esquece)\b")
_HUMAN = re.compile(
    r"\b(asesor|humano|persona real|agente humano|operador|atendente|"
    r"falar com (um|uma) (pessoa|humano)|hablar con (un|una) (persona|asesor))\b"
)
_COMPLAINT = re.compile(
    r"(no reconozco|desconozco|no hice|no realice|no autorice|cargo|cobro|me cobraron|"
    r"me descontaron|fraude|disputa|reclamo|nao reconheco|nao fiz|nao autorizei|cobranca|"
    r"cobraram|contestar|contestacao|estorno|golpe|clonad)"
)
_GREETING = re.compile(r"^\s*(hola|buen[oa]s|ola|oi|bom dia|boa tarde|boa noite)\b[\s!.,]*$")

_KEYWORD_INTENTS = (
    (_CANCEL, "CANCEL"),
    (_HUMAN, "HUMAN_AGENT"),
    (_COMPLAINT, "COMPLAINT"),
    (_GREETING, "GREETING"),
)


def fallback_classify(text: str, intents: Iterable[str]) -> Classification:
    available = set(intents)
    t = normalize(text)

    intent = "OUT_OF_SCOPE"
    confidence = 0.0
    for pattern, label in _KEYWORD_INTENTS:
        if label in available and pattern.search(t):
            intent = label
            confidence = 1.0
            break

    return Classification(
        guardrail="OK",
        guardrail_probability=0.0,
        language=detect_language(text),
        intent=intent,
        intent_confidence=confidence,
        sentiment="neutral",
        source="fallback",
    )
