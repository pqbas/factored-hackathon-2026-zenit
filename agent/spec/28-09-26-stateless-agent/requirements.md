# Requirements: Stateless agent

This phase applies [`docs/limites-agente-back.md`](../../../docs/limites-agente-back.md):
the back keeps the conversation in its Postgres and sends the whole history on
every request, so the agent becomes a function from history to reply. Today
the agent keeps only the last input message and rebuilds the rest from a
LangGraph checkpointer (MemorySaver locally, Lakebase in production), so it
throws away the history the back sends and keeps a second copy of it.

## 1. Functional requirements

After this phase, the agent must keep doing what it does today:

1. Reject a request without a valid session token, and a blocked message,
   without calling the LLM or any tool.
2. Answer UC-01 inquiries with the session customer's data only, and every
   Phase 3 situation, as today.
3. Keep the reply language rules: the customer's country by default, and a
   switch only on messages of three words or more.

And it changes in these ways:

4. The agent answers from the history in `request.input`, capped to the last
   20 messages. Two requests with the same `conversation_id` share nothing on
   the agent side.
5. Every card number, CVV or password in any human message of the history is
   masked before the LLM sees it, not only in the last message.
6. When the last message has fewer than three words, the reply language comes
   from the most recent earlier human message with three words or more,
   detected locally with no extra call; without one, from the customer's
   country.
7. The agent has no database: no checkpointer, no Lakebase instance and no
   `LAKEBASE_INSTANCE_NAME`.

## 2. Decisions

- The history cap is 20 messages, counted from the end, so a long chat can't
  grow the prompt without bound. The back still keeps the whole chat.
- Masking runs inside `classify`, over every human message, and replaces each
  masked message by id, as the Phase 2 masking already does for the last one.
  The last message is still checked on its raw text, so a card number in it
  keeps blocking the turn with the `SENSITIVE_DATA` reply.
- The back will also store masked messages in its own phase; the agent doesn't
  depend on that and masks every request.
- Earlier messages use the local detector in `src/llm/fallback.py`
  (`detect_language`), not Jev, because the doc forbids extra calls and Jev only
  classifies the last message. The last message keeps Jev's language.
- `conversation_id` (or `custom_inputs.thread_id`) only groups MLflow traces;
  no state is read by it.
- `custom_outputs` signals for the back (`blocked`, `handoff`) are left for
  Phase 6, together with the rest of `custom_outputs`. Until then the back
  resends blocked turns; the agent re-masks them and Jev only classifies the
  last message, so a resent injection isn't reclassified.
- Complaints move from Phase 5 to Phase 6. Handoff becomes Phase 7 and shrinks
  to detecting the handoff, building its summary and emitting
  `custom_outputs`; the handoff store, advisor assignment (the former Phase 7)
  and the console API move to the back. Phase 8 deploys without Lakebase.
- `docs/11` is the agent's tech stack (there is no `tech-stack.md`); it drops
  Lakebase from the agent.

## 3. Context

- `docs/limites-agente-back.md`: the decision this phase applies.
- `src/main.py`: `streaming` keeps `request.input[-1:]` and wraps the graph in
  `checkpointer()` with a psycopg retry.
- `src/graph/nodes/classify.py`: `conversation_language` reads the previous
  classification from the state.
- `src/llm/fallback.py`: `check_guardrail_rules`, `detect_language`.
- `back/server/src/routes/chat.ts`: sends `convertToModelMessages(messagesFromDb + new)`.
