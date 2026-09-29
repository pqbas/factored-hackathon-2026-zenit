# Validation: Recolección y confirmación confiables

This phase can merge when all of the following pass locally. Production is only redeployed when w1:p4 asks.

## Automated Tests

- [ ] `uv run pytest -q` exits 0 with no failures

### Specific test coverage required

#### Unit

- [ ] `next_step` asks the first missing field with its fixed text, for each field of 3.C and 3.D1
- [ ] `next_step` rejects a card or a product that isn't the customer's, and a charge that isn't in the movements, and lists the real options
- [ ] `next_step` with a complete, matching case returns the summary ending in the exact confirmation question, in es and pt
- [ ] `is_confirmation` is true for a yes to any of the three confirmation questions and false otherwise

#### Integration

- [ ] With a fake extractor, a COMPLAINT turn asks the next fixed question and doesn't call the tool-loop LLM
- [ ] A field already given is never asked again on the next turn
- [ ] A confirmation turn forces `hand_off_to_advisor` and hands off after verification
- [ ] An extractor failure falls back to the LLM path and still replies

#### End-to-end

- [ ] A whole 3.C conversation over `/invocations` (extractor and UC tools faked) ends in `custom_outputs.handoff` with reason `complaint`

## Manual Checks

- [ ] Local agent on :8001 with `CLASSIFIER=llm`, scenario 10 (demo-mx-1), 5 runs → 5 handoffs, and "¿Qué pasó?" is never asked twice in a run
- [ ] Same with scenario 04 and scenario 05, 5 runs each → 5 handoffs
- [ ] Scenario 06 with w1:p1's messages, 5 runs → 5 handoffs with `case_id` `CMP-G43865HGA80E110M7EWK`
- [ ] The same four scenarios with `CLASSIFIER=jev`, 2 runs each → all hand off
- [ ] demo-ar-1 in pt: "não reconheço uma cobrança no meu cartão" → the questions come in Portuguese
- [ ] "cancelar" in the middle of a collection → "Listo, lo dejamos ahí…" and no handoff
- [ ] Scenarios run straight against the agent on :8001, never through :3200, so `chatbot_dev` stays untouched

## Definition of Done

All boxes checked, merged into `main` with `/spec-ship`. The production deploy waits for w1:p4's request.
