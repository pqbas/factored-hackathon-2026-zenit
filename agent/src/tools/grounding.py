import re

from src.schemas.routing import GroundingKind, IntentRoute


def required_kinds(route: IntentRoute, customer_text: str, reply_text: str) -> list[GroundingKind]:
    """The kinds of account data the turn's query needs: the ones the customer's words ask for,
    else the first one the reply shows (a follow-up like "la de 1234" names nothing)."""
    asked = [
        kind for kind in route.grounding
        if any(re.search(pattern, customer_text, re.IGNORECASE) for pattern in kind.asks)
    ]
    if asked:
        return asked
    for kind in route.grounding:
        if re.search(kind.shows, reply_text, re.MULTILINE):
            return [kind]
    return []


def ungrounded(
    route: IntentRoute, customer_text: str, reply_text: str, called_ok: set[str]
) -> GroundingKind | None:
    """The first required kind whose tool didn't run in the turn, when the reply shows that
    kind's data. Replies without figures (questions, menus, fixed texts) never match."""
    for kind in required_kinds(route, customer_text, reply_text):
        if kind.tool not in called_ok and re.search(kind.shows, reply_text, re.MULTILINE):
            return kind
    return None
