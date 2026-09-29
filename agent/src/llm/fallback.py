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
_INQUIRY = re.compile(
    r"(saldo|limite|cupo|disponible|disponivel|movimient|movimentac|extrato|"
    r"cuanto tengo|quanto tenho|mis tarjetas|meus cartoes)"
)
_GOODBYE = re.compile(r"(eso es todo|adios|chau|hasta luego|isso e tudo|tchau|ate logo)")
_GREETING = re.compile(r"^\s*(hola|buen[oa]s|ola|oi|bom dia|boa tarde|boa noite)\b[\s!.,]*$")

# "cancelar mi tarjeta" is 3.D1 (cancel a product), not CANCEL (stop what's in progress).
_RETENTION = re.compile(
    r"\b(cancelar|cancela|cancelo|cerrar|dar de baja|encerrar|fechar)\s+(mi |mis |la |el |meu |minha |o |a )?"
    r"(tarjeta|cuenta|producto|cartao|conta|produto)"
)

_KEYWORD_INTENTS = (
    (_RETENTION, "RETENTION"),
    (_CANCEL, "CANCEL"),
    (_HUMAN, "HUMAN_AGENT"),
    (_COMPLAINT, "COMPLAINT"),
    # When Jev is unreachable (e.g. an App without internet egress) UC-01 must still route.
    (_INQUIRY, "GENERAL_INQUIRY"),
    (_GOODBYE, "GOODBYE"),
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


# --- Menu rules (docs/flujo-atencion.md, etapa 2) ------------------------------
# Deterministic, before the classifier: a letter, "menú" or an option of the D submenu
# only make sense against the menu, which a classifier reading one message can't see.

_MENU_LETTER = re.compile(r"(?:(?:la |letra |opcion |opcao |a opcao )?)([abcd])")
_MENU_WORDS = re.compile(r"(?:ver (?:el |o )?|volver al |voltar ao |mostrar (?:el |o )?)?(?:menu|opciones|opcoes)")
_SUBMENU_DIGIT = re.compile(r"(?:opcion |opcao )?([12])")
_LETTER_INTENTS = {"a": "CARD_OPTIONS", "b": "SAVINGS_OPTIONS", "c": "COMPLAINT", "d": "MORE_OPTIONS"}


def menu_rule_intent(text: str, previous_reply: str | None, submenus: dict[str, Iterable[str]]) -> str | None:
    """The intent a menu letter, "menú" or a submenu digit stands for, or None. `submenus`
    maps each submenu intent (CARD_OPTIONS, SAVINGS_OPTIONS, MORE_OPTIONS) to its texts."""
    t = normalize(text).strip(" .!?)")
    if _MENU_WORDS.fullmatch(t):
        return "MENU"
    if m := _MENU_LETTER.fullmatch(t):
        return _LETTER_INTENTS[m.group(1)]
    digit = _SUBMENU_DIGIT.fullmatch(t)
    if previous_reply is None or digit is None:
        return None
    previous = previous_reply.strip()
    if previous in submenus.get("MORE_OPTIONS", ()):
        return "RETENTION" if digit.group(1) == "1" else "CASE_STATUS"
    if previous in submenus.get("CARD_OPTIONS", ()) or previous in submenus.get("SAVINGS_OPTIONS", ()):
        # The use case's LLM reads the submenu and the digit in the history.
        return "GENERAL_INQUIRY"
    return None


def names_a_product_to_cancel(text: str) -> bool:
    return _RETENTION.search(normalize(text)) is not None
