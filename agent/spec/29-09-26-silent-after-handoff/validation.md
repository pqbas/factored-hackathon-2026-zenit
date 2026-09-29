# Validation: David se calla después de derivar (lado agente)

This phase can merge when every path is covered by a test and the checks below pass locally. Production is only redeployed when w1:p4 asks.

## Automated Tests

- [ ] `uv run pytest -q` exits 0 with no failures

### Specific test coverage required

#### Unit

- [ ] `paused` is true with the handoff in the history and no `[Asesor]` after it (es and pt)
- [ ] `paused` is false with `[Asesor]` after the handoff, and without a handoff
- [ ] `handled_by="ai_agent"` wins over the history; any other `handled_by` pauses
- [ ] `custom_outputs.paused` is true on a paused turn and false otherwise

#### Integration

- [ ] A paused conversation calls neither the classifier nor the LLM nor the UC tools
- [ ] After a verified `hand_off_to_advisor`, the other tool calls in the same round don't run and the LLM isn't called again

#### End-to-end

- [ ] A use-case turn over `/invocations` (stream) has no `response.output_text.delta`
- [ ] A handoff turn whose LLM writes text alongside the call only returns "Te comunico con un asesor…"
- [ ] A request with the history after the handoff returns no text and `custom_outputs.paused: true`
- [ ] The same history with `custom_inputs.handled_by="ai_agent"` gets a normal answer

## Manual Checks

- [ ] Local :8001, scenario 04 up to the handoff, then another customer message ("¿ya me atienden?") sent straight to the agent → empty stream, `paused: true`
- [ ] The same conversation with an `[Asesor] Hola, te ayudo con tu reclamo.` message after the handoff and a new customer message → David answers
- [ ] Scenario 01 (balance) in stream → the answer arrives as one item, with the right figures
- [ ] w1:p1 confirms that the back accepts the paused turn (no text and `paused: true`) without saving an empty message
- [ ] w1:p6 confirms that "David está escribiendo" shows during the whole wait of a tool turn (balance, ~5-8 s) with no streaming

## Definition of Done

All boxes checked, w1:p1's OK on the paused-turn contract and on `custom_inputs.handled_by`, and merged with `/spec-ship`. The production deploy waits for w1:p4's request.
