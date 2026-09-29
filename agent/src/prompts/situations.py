from src.prompts.messages import (
    CARD_OPTIONS,
    GREETING_REPLY,
    HUMAN_WITHOUT_TOPIC,
    MENU,
    MORE_OPTIONS,
    NOT_YET_AVAILABLE,
    OUT_OF_MENU,
    SAVINGS_OPTIONS,
)
from src.schemas.classification import reply_language

# The only situation the LLM still writes: a goodbye, in the customer's words.
SITUATIONS: dict[str, str] = {
    "goodbye": "El cliente se despide. Despídete con cordialidad y cierra la conversación.",
}

# Intents the chat can't serve (§3, regla 6): a short line, then the menu. Never a handoff.
_OUT_OF_MENU_INTENTS = {"OUT_OF_SCOPE", "COMMERCIAL"}
_NOT_YET_AVAILABLE_INTENTS = {"CASE_STATUS"}
# Menu letters that open a submenu instead of a use case (etapa 2 and 3.A, 3.B, D).
_SUBMENU_INTENTS = {
    "CARD_OPTIONS": "card_options",
    "SAVINGS_OPTIONS": "savings_options",
    "MORE_OPTIONS": "more_options",
}


def situation_for(classification: dict, intent_threshold: float) -> str:
    """The reply a turn without a use case gets (docs/flujo-atencion.md)."""
    intent = classification.get("intent")
    if intent == "MENU":
        return "menu"
    if intent in _SUBMENU_INTENTS:
        return _SUBMENU_INTENTS[intent]
    if classification.get("intent_confidence", 0.0) < intent_threshold:
        return "out_of_menu"
    if intent == "GREETING":
        return "greeting"
    if intent == "GOODBYE":
        return "goodbye"
    if intent == "HUMAN_AGENT":
        return "human_without_topic"
    if intent in _NOT_YET_AVAILABLE_INTENTS:
        return "not_yet_available"
    return "out_of_menu"


def fixed_reply(situation: str, language: str | None) -> str | None:
    """The fixed text for a situation, or None when the LLM writes it (goodbye)."""
    lang = reply_language(language)
    lead = {
        "greeting": GREETING_REPLY,
        "out_of_menu": OUT_OF_MENU,
        "human_without_topic": HUMAN_WITHOUT_TOPIC,
        "not_yet_available": NOT_YET_AVAILABLE,
    }
    submenus = {"card_options": CARD_OPTIONS, "savings_options": SAVINGS_OPTIONS, "more_options": MORE_OPTIONS}
    if situation in submenus:
        return submenus[situation][lang]
    if situation == "menu":
        return MENU[lang]
    if situation in lead:
        return lead[situation][lang] + "\n\n" + MENU[lang]
    return None
