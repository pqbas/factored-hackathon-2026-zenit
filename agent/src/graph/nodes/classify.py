from __future__ import annotations

import mlflow
from langchain_core.messages import AIMessage, HumanMessage

from src.graph.state import AgentState
from src.llm.fallback import check_guardrail_rules, detect_language, fallback_classify, mask_sensitive
from src.llm.jev import JevClient, JevUnavailable
from src.prompts.messages import GUARDRAIL_REPLIES
from src.schemas.classification import Classification, country_language, reply_language
from src.schemas.routing import IntentRoute


# es and pt are too close to tell apart from one or two words: Jev labels "Cancelar" as pt
# and "Ver saldo" as es. Below three words the reply keeps the language of the last earlier
# message long enough to tell, or the customer's country language when there is none.
_MIN_WORDS_TO_SWITCH = 3


def conversation_language(
    detected: str | None, text: str, earlier_texts: list[str], default: str
) -> str:
    if detected is not None and len(text.split()) >= _MIN_WORDS_TO_SWITCH:
        return detected
    # The agent keeps no state, so earlier messages are read from the history the back sends,
    # with the local detector: Jev only classifies the last message.
    for earlier in reversed(earlier_texts):
        if len(earlier.split()) >= _MIN_WORDS_TO_SWITCH:
            language = detect_language(earlier)
            if language in ("es", "pt"):
                return language
    return default


def _text(message: HumanMessage) -> str:
    return message.content if isinstance(message.content, str) else str(message.content)


def _human_messages(messages: list) -> list[HumanMessage]:
    human_messages = [message for message in messages if isinstance(message, HumanMessage)]
    if not human_messages:
        raise ValueError("classify requires at least one HumanMessage in state")
    return human_messages


async def classify(
    state: AgentState,
    jev: JevClient | None,
    routes: list[IntentRoute],
    threshold: float,
) -> dict:
    human_messages = _human_messages(state["messages"])
    human_message = human_messages[-1]
    text = _text(human_message)

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
    else:
        masked_text = None
        try:
            if jev is None:
                raise JevUnavailable("Jev is not configured")
            classification = await jev.classify(text, routes)
        except JevUnavailable:
            classification = fallback_classify(text, [route.intent for route in routes])

    # Only Jev can tell another language apart; the local detector says "other" when it
    # can't decide, so without Jev an undecided message keeps the conversation's language.
    detected = classification.language
    if classification.source != "jev" and detected not in ("es", "pt"):
        detected = None
    language = conversation_language(
        detected,
        text,
        [_text(message) for message in human_messages[:-1]],
        country_language(state.get("session", {}).get("country")),
    )
    classification = classification.model_copy(update={"language": language})

    _tag_trace(classification)

    # Cleared on every turn so a use case's tools never leak into an unrelated reply
    # (e.g. a greeting right after a GENERAL_INQUIRY in the same thread).
    update: dict = {"classification": classification.model_dump(), "use_case": None}
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
