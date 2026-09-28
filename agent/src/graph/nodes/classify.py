from __future__ import annotations

import mlflow
from langchain_core.messages import AIMessage, HumanMessage

from src.graph.state import AgentState
from src.llm.fallback import check_guardrail_rules, detect_language, fallback_classify
from src.llm.jev import JevClient, JevUnavailable
from src.prompts.messages import GUARDRAIL_REPLIES
from src.schemas.classification import Classification, reply_language
from src.schemas.routing import IntentRoute


def _last_human_message(messages: list) -> HumanMessage:
    for message in reversed(messages):
        if isinstance(message, HumanMessage):
            return message
    raise ValueError("classify requires at least one HumanMessage in state")


async def classify(
    state: AgentState,
    jev: JevClient | None,
    routes: list[IntentRoute],
    threshold: float,
) -> dict:
    human_message = _last_human_message(state["messages"])
    text = human_message.content if isinstance(human_message.content, str) else str(human_message.content)

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

    _tag_trace(classification)

    update: dict = {"classification": classification.model_dump()}
    messages: list = []

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
