from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable

from src.prompts.messages import ASK_PRODUCT, ASK_REASON
from src.schemas.classification import Classification


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    return "".join(ch for ch in text if not unicodedata.combining(ch))


_PT_MARKERS = re.compile(
    r"\b(nao|voce|obrigad[oa]|cobranca|reconheco|estorno|compra que nao|minha|meu|cartao|"
    r"ontem|hoje|atendente|sim|oi|ola|valor|nenhum[a]?|quanto|tenho|poupanca|quero)\b"
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
# Etapa 4, paso 6: a yes to David's confirmation question keeps its operation. Without this
# rule a classifier read "sí" after "…pasar tu consulta a un asesor?" as HUMAN_AGENT.
_AFFIRMATIVE = re.compile(r"(si|sim|confirmo|si,? confirmo|sim,? confirmo|correcto|claro|dale|ok|isso|esta bien|de acuerdo)")
# The last line of David's confirmation question has the operation's exact phrase. A line that
# only mentions "solicitud" and "reclamo" in passing ("sua solicitação … reclamação") isn't one.
_TO_ADVISOR = re.compile(r"(asesor|atendente)")
_CONFIRMATIONS = (
    (re.compile(r"(pasar tu|passar sua) consulta"), "CASE_STATUS"),
    (re.compile(r"(pasar tu|passar sua) (solicitud|solicitacao)"), "RETENTION"),
    (re.compile(r"(pasar tu|passar sua) (reclamo|reclamacao)"), "COMPLAINT"),
)


def _confirmed_operation(previous: str) -> str | None:
    last_line = previous.strip().splitlines()[-1] if previous.strip() else ""
    if "?" not in last_line or not _TO_ADVISOR.search(last_line):
        return None
    for pattern, intent in _CONFIRMATIONS:
        if pattern.search(last_line):
            return intent
    return None


def _confirmed_by(normalized_text: str, previous_reply: str | None) -> str | None:
    if previous_reply is not None and _AFFIRMATIVE.fullmatch(normalized_text):
        return _confirmed_operation(normalize(previous_reply))
    return None


def is_confirmation(text: str, previous_reply: str | None) -> bool:
    """Whether the text is a yes to David's confirmation question in the previous reply."""
    return _confirmed_by(normalize(text).strip(" .!?)"), previous_reply) is not None


_ABOUT_COMPLAINT = re.compile(r"(reclamo|reclamacao)")


def case_status_follow_up(text: str, previous_reply: str | None) -> bool:
    """Whether the text answers David's question about the customer's complaint (3.D2): the
    previous reply's last line asks about the reclamo without offering an advisor. A menu letter,
    "menú" and a cancel are not answers; their own rules catch them."""
    if not previous_reply or not previous_reply.strip():
        return False
    last_line = normalize(previous_reply).strip().splitlines()[-1]
    if "?" not in last_line or not _ABOUT_COMPLAINT.search(last_line) or _TO_ADVISOR.search(last_line):
        return False
    t = normalize(text).strip(" .!?)")
    return not (_MENU_WORDS.fullmatch(t) or _MENU_LETTER.fullmatch(t) or _CANCEL.match(t))


_LETTER_INTENTS = {"a": "CARD_OPTIONS", "b": "SAVINGS_OPTIONS", "c": "COMPLAINT", "d": "MORE_OPTIONS"}


def menu_rule_intent(text: str, previous_reply: str | None, submenus: dict[str, Iterable[str]]) -> str | None:
    """The intent a menu letter, "menú" or a submenu digit stands for, or None. `submenus`
    maps each submenu intent (CARD_OPTIONS, SAVINGS_OPTIONS, MORE_OPTIONS) to its texts."""
    t = normalize(text).strip(" .!?)")
    if _MENU_WORDS.fullmatch(t):
        return "MENU"
    if m := _MENU_LETTER.fullmatch(t):
        return _LETTER_INTENTS[m.group(1)]
    if operation := _confirmed_by(t, previous_reply):
        return operation
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


_RETENTION_QUESTIONS = tuple(normalize(text.split("\n")[0]) for text in ASK_PRODUCT.values())
_REASON_QUESTIONS = {normalize(text) for text in ASK_REASON.values()}


def asked_retention_question(previous_reply: str | None) -> bool:
    """Whether David's previous reply is one of the cancellation's own questions: the product
    (possibly after a "no encuentro ese producto" line) or the reason."""
    if not previous_reply:
        return False
    previous = normalize(previous_reply).strip()
    if previous in _REASON_QUESTIONS:
        return True
    return any(previous.startswith(q) or ("\n\n" + q) in previous for q in _RETENTION_QUESTIONS)


def retention_in_progress(text: str, previous_reply: str | None) -> bool:
    """Whether the text answers one of the cancellation's questions, so the operation stays
    RETENTION without the classifier. A cancel, "menú" and a menu letter keep their own rules."""
    if not asked_retention_question(previous_reply):
        return False
    t = normalize(text).strip(" .!?)")
    return not (_MENU_WORDS.fullmatch(t) or _MENU_LETTER.fullmatch(t) or _CANCEL.match(t))


def answered_reason_question(previous_reply: str | None) -> bool:
    return bool(previous_reply) and normalize(previous_reply).strip() in _REASON_QUESTIONS
