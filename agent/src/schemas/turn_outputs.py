from __future__ import annotations

from src.schemas.classification import Classification


def turn_custom_outputs(
    thread_id: str,
    classification: dict | None,
    use_case: str | None,
    threshold: float,
    handoff: dict | None = None,
    paused: bool = False,
) -> dict:
    """The signals the back stores for each turn (docs/limites-agente-back.md). Only labels,
    never message text, so no sensitive data can leave through them."""
    if classification is None:
        # The gate rejected the session: nothing was classified.
        return {
            "thread_id": thread_id, "use_case": None, "intent": None, "language": None,
            "blocked": False, "handoff": None, "paused": paused,
        }
    parsed = Classification(**classification)
    return {
        "thread_id": thread_id,
        "use_case": use_case,
        "intent": parsed.intent,
        "language": parsed.language,
        "blocked": parsed.blocked(threshold),
        # { reason, summary, facts } when the turn handed the case off (etapa 5), else None.
        "handoff": handoff,
        # True when the conversation is with an advisor and David stayed silent this turn.
        "paused": paused,
    }
