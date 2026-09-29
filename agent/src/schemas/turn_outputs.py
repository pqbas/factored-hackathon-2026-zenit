from __future__ import annotations

from src.schemas.classification import Classification


def turn_custom_outputs(
    thread_id: str,
    classification: dict | None,
    use_case: str | None,
    threshold: float,
    handoff: dict | None = None,
    paused: bool = False,
    usage: dict | None = None,
    model: str | None = None,
    prompt_version: str | None = None,
    classifier: str | None = None,
) -> dict:
    """The signals the back stores for each turn (docs/limites-agente-back.md). Only labels,
    never message text, so no sensitive data can leave through them."""
    # Tokens summed over the turn's LLM calls (None when none reported usage), the configured
    # model and classifier, and the hash of the prompt files: the evaluation runner's signals.
    signals = {"usage": usage, "model": model, "prompt_version": prompt_version, "classifier": classifier}
    if classification is None:
        # The gate rejected the session: nothing was classified.
        return {
            "thread_id": thread_id, "use_case": None, "intent": None, "language": None,
            "blocked": False, "handoff": None, "paused": paused, **signals,
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
        **signals,
    }
