# Validation: Create the project structure

The phase is done when all of the following pass locally. Nothing is deployed
in this phase.

## Automated Tests

- [ ] `uv run pytest` exits 0 and collects nothing from `legacy/`
- [ ] `uv run python -c "import src.main"` exits 0
- [ ] `grep -rn "agent_server" src tests pyproject.toml app.yaml` returns nothing

### Specific test coverage required

- [ ] `resolve_session` with a valid token returns `authenticated=True` and its `customer_id`
- [ ] `resolve_session` returns `reason` `missing`, `invalid` and `expired` for each case
- [ ] `resolve_session` reads sessions from `DEMO_SESSIONS_JSON` when set
- [ ] Graph with an invalid session replies with the fixed message and never calls the LLM
- [ ] Graph with a valid session returns the LLM reply
- [ ] Graph keeps history across two turns on the same `thread_id`

## Manual Checks

- [ ] `uv run start-server`, then `POST /invocations` with `session_token=demo-mx-1` and "Hola" → LLM answer
- [ ] Same request with `stream: true` → text arrives as deltas
- [ ] Same request with `session_token=demo-expired` → fixed rejection, no LLM trace span
- [ ] Second message with the same `thread_id` ("¿qué te dije antes?") → answer refers to the first
- [ ] The turn appears as a trace in the MLflow experiment from `.env`

## Definition of Done

All boxes checked, no files from `agent_server/` left outside `legacy/`, and
no empty placeholder modules in `src/`.
