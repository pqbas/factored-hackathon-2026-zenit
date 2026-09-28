# Requirements: Create the project structure

This phase moves the agent to the `src/` layout in
[`docs/13`](../../docs/13-estructura-del-agente.md) and replaces the dispute
graph with the smallest graph that answers a message: `gate → respond`. The
contract of `POST /invocations` and the conversation model don't change; each
later phase documents the changes it makes to them.

## 1. Functional requirements

After the move, the agent must keep doing what it does today:

1. Reply to a customer message, either as a full response or streamed token by
   token.
2. Identify the customer only from the session token, never from the chat text.
3. Reject a message with a missing, unknown or expired session with a fixed
   reply, without calling the LLM.
4. Remember earlier messages of the same conversation, in Lakebase when it is
   configured and in process memory otherwise.
5. Record every turn as a trace in MLflow.

And it changes in one way:

6. A message with a valid session is answered by the LLM with the base prompt
   of the bank assistant. The dispute flow (unrecognized charges) stops working
   until Phase 5.

## 2. Decisions

- The current code moves to `legacy/` instead of being deleted, because it is
  the reference for dispute policy, Warehouse queries and NLU while Phases 2–5
  rebuild them. It stays outside the wheel and outside `pytest`, and is
  deleted after Phase 5.
- The dispute flow is not ported to the new structure, because Phases 2–5
  replace that code anyway.
- Only the files this phase uses are created. `classify`, `load_context`,
  `handoff`, `cancel`, `tools/`, `llm/jev.py`, `llm/fallback.py`, the
  `*_repo.py` other than sessions, `db/connection.py`, `schemas/` and `api/`
  are created in the phase that implements them.
- Sessions stay hardcoded, now in `src/db/session_repo.py`, with the same test
  tokens; the real Customer Sessions table is a separate pending item.
- The checkpointer does not use `db/connection.py`, because
  `AsyncCheckpointSaver` manages its own Lakebase connection; the shared pool
  arrives in Phase 6.
- Stream conversion lives in `src/main.py`, because it is the only code that
  knows the Responses API and `docs/13` has no `utils.py`.
- Imports start from `src`, with `packages = ["src"]` in `pyproject.toml`.

## 3. Context

- `spec/roadmap.md`: Phase 1, Create the project structure.
- `docs/13-estructura-del-agente.md`: target folder layout.
- `docs/11-herramientas-de-implementacion.md`: LangGraph, ChatDatabricks,
  Lakebase checkpointer.
- `docs/01-identidad-de-usuario.md`: session token, never chat text.
- Existing patterns: `agent_server/agent.py` (invoke and stream, thread id,
  checkpointer lock and retry), `agent_server/utils.py` (stream conversion),
  `agent_server/dispute/session.py` (session resolution).
