# Requirements: David se calla después de derivar (lado agente)

Standing rule of the user: when David hands off to an advisor, the agent pauses in that conversation and says nothing more until a person gives it back. This phase closes every path by which the agent can emit text in or after a handoff turn, with one test per path. The back's paths (queued AgentTurn, late streams, human_queue without a Handoff row, retries) belong to w1:p1 in its own spec. Here only the contract the back has to honor is recorded. The `custom_outputs.handoff` contract doesn't change; `paused` is added.

## 1. Functional requirements

After this phase, the agent must keep doing what it does today:

1. A confirmed and verified handoff answers only "Te comunico con un asesor, que ya tiene los datos de tu caso." (or its pt) and sends `custom_outputs.handoff`.
2. The summary for the advisor only travels in `custom_outputs.handoff.summary` (PR #74).
3. A conversation returned to David, where the advisor wrote messages with `[Asesor]`, gets its answers from David as today.

And it changes in these ways:

4. **Same turn, before the handoff:** a use-case turn (a route with tools: GENERAL_INQUIRY, COMPLAINT, RETENTION, CASE_STATUS) streams no text deltas. Its reply goes out as a single `output_item.done` at the end of the turn. That way no text the LLM writes alongside a `hand_off_to_advisor` call reaches the customer.
5. **Same turn, after the handoff:** once `hand_off_to_advisor` is verified, the turn ends. The other tool calls of the same round aren't executed, the LLM isn't called again, and the only text item is the fixed reply. `summarize_handoff` doesn't stream (already true, stays covered by a test).
6. **Later turns:** if the history the back sends contains the handoff reply (es or pt) and no advisor message (`[Asesor] …`) after it, and the back didn't mark the conversation as returned, the agent doesn't reply.
   - That turn doesn't classify or call the LLM or the tools.
   - The stream carries no text items.
   - `custom_outputs` = `{thread_id, use_case: null, intent: null, language: null, blocked: false, handoff: null, paused: true}`.
7. **Signal from the back:** if `custom_inputs.handled_by` comes in, the agent trusts it. `ai_agent` → it answers normally, even if the history has the handoff and no `[Asesor]` (the advisor returned it without writing). Any other value → paused as in 6. If it doesn't come in, rule 6 applies to the history.
8. Every turn that isn't paused carries `paused: false` in `custom_outputs`.

## 2. Decisions

- Remove the deltas only in use-case turns, because that's where the LLM can call tools. Greetings, menus and fixed replies are already whole items, and goodbyes keep streaming. The customer sees the balance or the case summary all at once instead of token by token, a cost accepted to guarantee requirement 4.
- Detect "use-case turn" by the `use_case` that `load_context` writes before `respond` starts, which `main._process_agent_astream_events` already records. It needs no LLM tags or model-dependent streaming config.
- The paused rule in the agent is a second guard: the back is the one that has to not call the agent while `handledBy != ai_agent` (`docs/limites-agente-back.md`). The agent covers the case where it gets called anyway (retry, turn queued before the handoff, race), because the user saw David keep talking.
- `custom_inputs.handled_by` is optional and backward compatible. Without it, the history rule works on its own, except when the advisor returns the chat without writing anything. That case needs the back to send the field, so it goes to w1:p1 as a contract request.
- The paused check runs in a node before `classify` (right after `gate`), so it never spends Jev, the LLM or the warehouse.
- Items left to the back (w1:p1): cancel the queued AgentTurn when the handoff comes in, discard streams that arrive after the handoff, the `agent-queue.ts` path that sets `human_queue` without a Handoff row (Santiago's and Javier's chats in chatbot_dev), retries, and sending `custom_inputs.handled_by`.

## 3. Context

- `docs/flujo-atencion.md`: etapa 5, step 4 ("David deja de responder").
- `docs/limites-agente-back.md`: the back owns `handledBy` and doesn't call the agent outside `ai_agent`.
- Existing code:
  - `src/main.py` (`_process_agent_astream_events`, `_STREAMING_NODES`, `turn`).
  - `src/graph/build.py` (gate → classify).
  - `src/graph/nodes/gate.py`.
  - `src/graph/nodes/respond.py` (`_respond_with_tools`, `_hand_off`).
  - `src/prompts/messages.py` (`HANDOFF_REPLY`).
  - `src/prompts/advisor.py` (`ADVISOR_PREFIX`).
  - `src/schemas/turn_outputs.py`.
- Back: `back/server/src/agent-turn.ts` (`buildAgentHistory` filters system messages, so the agent doesn't see "devuelto a David"), `back/server/src/agent-queue.ts`.
