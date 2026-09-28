# Plan: Create the project structure

## Code changes

Where each module of this phase comes from.

| Module                                              | Origin                                    | Change                                                           |
| --------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| `src/main.py`                                       | `agent.py`, `start_server.py`, `utils.py` | Merged; drops dispute data and the `workflow.state` event.       |
| `src/config.py`                                     | —                                         | New; env vars read in one place.                                 |
| `src/db/session_repo.py`                            | `dispute/session.py`                      | Moved; reads env through `Settings`.                             |
| `src/db/checkpointer.py`                            | `agent.py`                                | Moved; same Lakebase/MemorySaver logic.                          |
| `src/llm/chat.py`                                   | `agent.py`                                | Moved; `ChatDatabricks` creation only.                           |
| `src/graph/*`                                       | —                                         | New; replaces `dispute/graph.py`.                                |
| `src/prompts/*`                                     | —                                         | New; `dispute/i18n.py` stays in legacy until Phase 2 (language). |
| `dispute/data.py`, `nlu.py`, `policy.py`, `i18n.py` | —                                         | Not used; stay in `legacy/` as reference for Phases 2–5.         |

---

## Group 1: Legacy

1. Create `legacy/` and move into it with `git mv`:
   - `agent_server/` (whole package, including `dispute/`)
   - `tests/test_dispute.py` → `legacy/tests/test_dispute.py`
   - `DISPUTE_WORKFLOW.md`

2. Add `legacy/README.md`: one paragraph saying the code is reference only,
   not imported, not packaged, not tested, and is deleted after Phase 5.

---

## Group 2: Project config

3. In `pyproject.toml`:
   - `start-server = "src.main:main"`
   - remove `agent-evaluate` (evaluation returns in Phase 8, under `evals/`)
   - add `[tool.hatch.build.targets.wheel] packages = ["src"]`
   - add `[tool.pytest.ini_options] testpaths = ["tests"]`
   - declare `psycopg` as a direct dependency (used by the retry in
     `src/main.py`; today it arrives only transitively)

4. Run `uv lock` and `uv sync`.

5. Create `src/config.py`: a frozen dataclass `Settings` read from env with the
   names in `requirements.md` (`LLM_ENDPOINT`, `LAKEBASE_INSTANCE_NAME`,
   `CHECKPOINT_SCHEMA="agent_checkpoints"`, `DEMO_SESSION_TOKEN`,
   `DEMO_SESSIONS_JSON`) and a module-level `settings`.

---

## Group 3: Data and LLM

6. Create `src/db/session_repo.py`: move `Session`, `_DEFAULT_SESSIONS` and
   `resolve_session` from `legacy/agent_server/dispute/session.py`; read the
   env vars through `src/config.py`.

7. Create `src/db/checkpointer.py` from `legacy/agent_server/agent.py`:
   - `MemorySaver` when `LAKEBASE_INSTANCE_NAME` is empty
   - `AsyncCheckpointSaver(instance_name, schema)` otherwise
   - one-time `setup()` guarded by an `asyncio.Lock`
   - exposed as `@asynccontextmanager async def checkpointer()`

8. Create `src/llm/chat.py`: `get_chat_model()` returning
   `ChatDatabricks(endpoint=settings.llm_endpoint, temperature=0)`, cached.

---

## Group 4: Graph

9. Create `src/prompts/system.md`: base prompt of the bank assistant (role,
   tone, never ask for or reveal account data it doesn't have, Spanish by
   default).

10. Create `src/prompts/messages.py`: `SESSION_REJECTED` fixed replies keyed
    by `reason` (`missing`, `invalid`, `expired`).

11. Create `src/graph/state.py`: `AgentState(TypedDict)` with `messages`
    (`Annotated[list, add_messages]`), `session`, `thread_id`.

12. Create `src/graph/nodes/gate.py`: `gate(state)` returns nothing when
    `session.authenticated`, else an `AIMessage` with `SESSION_REJECTED[reason]`.

13. Create `src/graph/nodes/respond.py`: `async respond(state, llm)` prepends a
    `SystemMessage` from `system.md` to `state["messages"]` and returns the
    LLM reply.

14. Create `src/graph/edges.py`: `after_gate(state)` returns `"respond"` if
    authenticated, else `END`.

15. Create `src/graph/build.py`: `build_graph(llm, checkpointer)` with
    `START → gate`, conditional `after_gate`, `respond → END`; `llm` is
    injected so tests pass a fake model.

---

## Group 5: Server

16. Create `src/main.py` from `legacy/agent_server/agent.py`,
    `start_server.py` and `utils.py`:
    - `load_dotenv` before other imports, `mlflow.langchain.autolog()`
    - `_thread_id(request)` (same order: `custom_inputs`, `conversation_id`, UUID)
    - `@stream` builds input state (last message, `resolve_session`,
      `thread_id`), runs the graph and converts events; streams only the
      `respond` node; one retry on `psycopg.OperationalError` with no output
    - `@invoke` collects `response.output_item.done` items from `@stream`
    - `AgentServer("ResponsesAgent", enable_chat_proxy=False)`, `app`,
      `main()` running `src.main:app`
    - drop the `workflow.state.updated` event (dispute-only)

17. Create empty `src/__init__.py`, `src/graph/__init__.py`,
    `src/graph/nodes/__init__.py`, `src/db/__init__.py`,
    `src/llm/__init__.py`, `src/prompts/__init__.py`.

---

## Group 6: Tests

18. Create `tests/unit/test_session_repo.py`: valid, missing, invalid and expired
    tokens; `DEMO_SESSIONS_JSON` override.

19. Create `tests/integration/test_graph.py` with `GenericFakeChatModel` and `MemorySaver`:
    - invalid session → fixed reply, fake LLM not called
    - valid session → LLM reply in the last message
    - two turns on one `thread_id` → second LLM call sees the first message

---

## Group 7: References

20. Update paths from `agent_server/` to `src/`:
    - `AGENTS.md` "Key Files" table
    - `README.md` Pendientes (`src/db/session_repo.py`)
    - `docs/01-identidad-de-usuario.md` line 41
    - `databricks.yml` comment on the LLM endpoint
