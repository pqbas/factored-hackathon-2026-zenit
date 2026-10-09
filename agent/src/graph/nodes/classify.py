from __future__ import annotations

import logging

import mlflow
from langchain_core.messages import AIMessage, HumanMessage

from src.llm.chat import text_of
from src.config import settings
from src.graph.state import AgentState
from src.llm.fallback import (
    case_status_follow_up,
    check_guardrail_rules,
    detect_language,
    fallback_classify,
    is_confirmation,
    mask_sensitive,
    menu_rule_intent,
    names_a_product_to_cancel,
    retention_in_progress,
)
from src.prompts.advisor import ADVISOR_PREFIX, strip_advisor_prefix
from src.prompts.messages import CARD_OPTIONS, GUARDRAIL_REPLIES, MORE_OPTIONS, SAVINGS_OPTIONS
from src.schemas.classification import (
    Classification,
    ClassifierUnavailable,
    country_language,
    reply_language,
)
from src.schemas.routing import IntentRoute

logger = logging.getLogger(__name__)


# es and pt are too close to tell apart from one or two words: Jev labels "Cancelar" as pt
# and "Ver saldo" as es. Below three words the reply keeps the language of the last earlier
# message long enough to tell, or the customer's country language when there is none.
_MIN_WORDS_TO_SWITCH = 3


def conversation_language(
    detected: str | None, text: str, earlier_texts: list[str], default: str, chosen: str | None = None
) -> str:
    if detected is not None and len(text.split()) >= _MIN_WORDS_TO_SWITCH:
        return detected
    # A short message ("hola", "C", "sí") follows the language the customer picked in the chat.
    if chosen in ("es", "pt"):
        return chosen
    # The agent keeps no state, so earlier messages are read from the history the back sends,
    # with the local detector: Jev only classifies the last message.
    for earlier in reversed(earlier_texts):
        if len(earlier.split()) >= _MIN_WORDS_TO_SWITCH:
            language = detect_language(earlier)
            if language in ("es", "pt"):
                return language
    return default


def _text(message: HumanMessage) -> str:
    return text_of(message.content)


_SUBMENUS = {
    "CARD_OPTIONS": set(CARD_OPTIONS.values()),
    "SAVINGS_OPTIONS": set(SAVINGS_OPTIONS.values()),
    "MORE_OPTIONS": set(MORE_OPTIONS.values()),
}

# Enough for the question David closed his reply with, without resending a whole balance or menu.
_DAVID_CHARS = 300
# The transcript's cap, so the classifier's prompt stays bounded on long conversations.
_TRANSCRIPT_MESSAGES = 12


def _previous_reply(messages: list) -> str | None:
    """The assistant message right before the customer's last message, if there is one."""
    if len(messages) < 2 or not isinstance(messages[-2], AIMessage):
        return None
    content = messages[-2].content
    return content if isinstance(content, str) else str(content)


def _transcript(messages: list, start: int = 0) -> str | None:
    """The current conversation as the classifier reads it: the messages from `start`, without
    the customer's last one (passed apart as the text), the last 12 of them, masked."""
    earlier = messages[max(start, 0):]
    if earlier and isinstance(earlier[-1], HumanMessage):
        earlier = earlier[:-1]
    lines = []
    for message in earlier[-_TRANSCRIPT_MESSAGES:]:
        content = text_of(message.content)
        if isinstance(message, HumanMessage):
            lines.append(f"Cliente: {mask_sensitive(content)}")
        elif isinstance(message, AIMessage) and content.lstrip().startswith(ADVISOR_PREFIX):
            lines.append(f"Asesor: {mask_sensitive(strip_advisor_prefix(content))}")
        elif isinstance(message, AIMessage):
            lines.append(f"David: {mask_sensitive(content)[-_DAVID_CHARS:]}")
    return "\n".join(lines) or None


def _human_messages(messages: list) -> list[HumanMessage]:
    human_messages = [message for message in messages if isinstance(message, HumanMessage)]
    if not human_messages:
        raise ValueError("classify requires at least one HumanMessage in state")
    return human_messages


async def classify(
    state: AgentState,
    classifier,
    routes: list[IntentRoute],
    threshold: float,
) -> dict:
    human_messages = _human_messages(state["messages"])
    human_message = human_messages[-1]
    text = _text(human_message)
    previous_reply = _previous_reply(state["messages"])

    rule_match = check_guardrail_rules(text)
    if rule_match is not None:
        category, masked_text = rule_match
        classification = Classification(
            guardrail=category,
            guardrail_probability=1.0,
            language=detect_language(text),
            intent="OUT_OF_SCOPE",
            intent_confidence=0.0,
            sentiment="neutral",
            source="rules",
        )
    elif menu_intent := menu_rule_intent(text, previous_reply, _SUBMENUS):
        masked_text = None
        classification = Classification(
            guardrail="OK",
            guardrail_probability=0.0,
            language=detect_language(text),
            intent=menu_intent,
            intent_confidence=1.0,
            sentiment="neutral",
            source="rules",
        )
    elif case_status_follow_up(text, previous_reply):
        # An answer to David's question about the customer's complaint stays in CASE_STATUS: the
        # classifier read "necesito que me devuelvan el dinero" as a charge complaint.
        masked_text = None
        classification = Classification(
            guardrail="OK",
            guardrail_probability=0.0,
            language=detect_language(text),
            intent="CASE_STATUS",
            intent_confidence=1.0,
            sentiment="neutral",
            source="rules",
        )
    elif retention_in_progress(text, previous_reply):
        # Once the customer is cancelling a product, the answers to David's two questions
        # (which product, why) are part of it: the reason is free text, never reclassified.
        masked_text = None
        classification = Classification(
            guardrail="OK",
            guardrail_probability=0.0,
            language=detect_language(text),
            intent="RETENTION",
            intent_confidence=1.0,
            sentiment="neutral",
            source="rules",
        )
    else:
        masked_text = None
        # classifier is Jev or the LLM (CLASSIFIER, see src/main.py); either one failing
        # falls back to the keyword rules. The current conversation goes along so an answer to
        # David's question ("la de 1070", "sí") is read in its context.
        try:
            if classifier is None:
                raise ClassifierUnavailable("classifier is None")
            classification = await classifier.classify(
                text, routes, context=_transcript(state["messages"], state.get("conversation_start", 0))
            )
        except ClassifierUnavailable as exc:
            name = type(classifier).__name__ if classifier is not None else "Classifier"
            logger.warning("%s unavailable, classifying with rules: %s", name, exc)
            classification = fallback_classify(text, [route.intent for route in routes])
        # "Cancelar mi tarjeta" cancels a product (3.D1), never stops the flow (§3, regla 5).
        if classification.intent == "CANCEL" and names_a_product_to_cancel(text):
            classification = classification.model_copy(update={"intent": "RETENTION"})
    logger.info(
        "classify source=%s intent=%s language=%s guardrail=%s",
        classification.source, classification.intent, classification.language, classification.guardrail,
    )

    # Only Jev and the LLM can tell another language apart; the local detector says "other"
    # when it can't decide, so with rules an undecided message keeps the conversation's language.
    detected = classification.language
    # The classifier once said "es" for a clear Portuguese message: when the local markers are
    # sure of es or pt, they win.
    local = detect_language(text)
    if local in ("es", "pt") and local != detected:
        detected = local
    if classification.source not in ("jev", "llm") and detected not in ("es", "pt"):
        detected = None
    language = conversation_language(
        detected,
        text,
        [_text(message) for message in human_messages[:-1]],
        country_language(state.get("session", {}).get("country")),
        state.get("session", {}).get("chosen_language"),
    )
    classification = classification.model_copy(update={"language": language})

    _tag_trace(classification)

    # Cleared on every turn so a use case's tools never leak into an unrelated reply
    # (e.g. a greeting right after a GENERAL_INQUIRY in the same thread).
    update: dict = {
        "classification": classification.model_dump(),
        "use_case": None,
        # A yes to the confirmation question: respond forces the handoff tool on this turn.
        "confirmation": is_confirmation(text, previous_reply),
    }
    messages: list = []

    # The back resends the whole history, raw, on every request: mask every earlier message
    # before the LLM sees it. Replacing by id keeps each message in place.
    for message in human_messages[:-1]:
        masked = mask_sensitive(_text(message))
        if masked != _text(message):
            messages.append(HumanMessage(content=masked, id=message.id))

    # Only the rules path produces a masked value: Jev returns the category, not the matched text.
    if classification.guardrail == "SENSITIVE_DATA" and masked_text is not None:
        messages.append(HumanMessage(content=masked_text, id=human_message.id))

    if classification.blocked(threshold):
        language = reply_language(classification.language)
        messages.append(AIMessage(content=GUARDRAIL_REPLIES[classification.guardrail][language]))

    if messages:
        update["messages"] = messages

    return update


def _tag_trace(classification: Classification) -> None:
    if not settings.tracing_enabled:
        # No trace to tag (the App runs without tracing); MLflow would warn on every turn.
        return
    mlflow.update_current_trace(
        tags={
            "classify.guardrail": classification.guardrail,
            "classify.guardrail_probability": str(classification.guardrail_probability),
            "classify.language": classification.language,
            "classify.intent": classification.intent,
            "classify.intent_confidence": str(classification.intent_confidence),
            "classify.sentiment": classification.sentiment,
            "classify.source": classification.source,
        }
    )
