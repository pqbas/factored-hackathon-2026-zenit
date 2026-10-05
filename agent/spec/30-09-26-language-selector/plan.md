# Plan: David answers in the language the customer picked

1. `src/main.py`: put `custom_inputs.language` into the session dict as `chosen_language`, only when it's `es` or `pt` (else None).
2. `src/graph/nodes/classify.py`: `conversation_language(detected, text, earlier_texts, default, chosen=None)`. After the 3-word rule and before the earlier messages, return `chosen` when set. Pass `state["session"].get("chosen_language")`.
3. `src/prompts/messages.py`: `SESSION_REJECTED[reason]` becomes `{"es": <today's text>, "pt": <new>}`. `src/graph/nodes/gate.py` picks the language from `chosen_language`, defaulting to es. Update the tests that read `SESSION_REJECTED[reason]`.
4. Tests:
   - unit: `conversation_language` with a short message and chosen pt gives pt; a 3-word Spanish sentence with chosen pt gives es; no chosen language behaves as today; an invalid value is ignored (main);
   - integration: a greeting with `chosen_language=pt` gets the pt greeting and menu, and the gate's rejection in pt;
   - e2e: `/invocations` with `custom_inputs.language="pt"` and "hola" answers the pt greeting; without it, es.
