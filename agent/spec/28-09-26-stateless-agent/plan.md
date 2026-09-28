# Plan: Stateless agent

## Code changes

| Module                              | Change                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `src/main.py`                       | Full `request.input`, capped to 20; no checkpointer, no psycopg retry.    |
| `src/graph/build.py`                | `build_graph` without the `checkpointer` argument; `compile()` bare.      |
| `src/db/checkpointer.py`            | Deleted.                                                                  |
| `src/llm/fallback.py`               | `mask_sensitive(text)` masks every card number, CVV and password.         |
| `src/graph/nodes/classify.py`       | Masks every human message; language from the history.                    |
| `app.yaml`, `databricks.yml`        | Drop `LAKEBASE_INSTANCE_NAME` and the Lakebase instance and resource.     |
| `pyproject.toml`                    | Drop the Lakebase-only dependencies if nothing else uses them.            |
| `spec/roadmap.md`, docs 07/08/11/13 | Apply `docs/limites-agente-back.md`.                                      |

## Group 1: Stateless graph

1. `src/main.py`: `input_state["messages"]` is
   `to_chat_completions_input(...)[-MAX_HISTORY_MESSAGES:]` with
   `MAX_HISTORY_MESSAGES = 20`. Remove `checkpointer`, `psycopg`, the retry
   loop and `config`; keep `thread_id` for the MLflow session.
2. `src/graph/build.py`: drop the `checkpointer` parameter and compile with no
   checkpointer.
3. Delete `src/db/checkpointer.py`; drop `LAKEBASE_INSTANCE_NAME` from
   `app.yaml` and the `database_instances` and `database` resource from
   `databricks.yml`; drop dependencies only the checkpointer used.

## Group 2: Masking and language

4. `src/llm/fallback.py`: `mask_sensitive(text) -> str` replaces every card
   number with `[NÚMERO OCULTO]` and every CVV or password value with
   `[DATO OCULTO]`; `check_guardrail_rules` uses it for its masked text.
5. `src/graph/nodes/classify.py`: for every `HumanMessage` whose masked text
   differs, add `HumanMessage(content=masked, id=message.id)` to the update.
   Detection on the last message stays on the raw text.
6. `conversation_language(detected, text, history, default)`: with three words
   or more, `detected`; otherwise the first earlier human message, newest
   first, with three words or more whose `detect_language` is `es` or `pt`;
   otherwise `default`.

## Group 3: Docs and roadmap

7. `spec/roadmap.md`: new Phase 5 (this one), complaints to Phase 6, handoff
   as Phase 7 reduced to detection, summary and `custom_outputs`, advisor
   assignment and the console API pointed to the back's roadmap, Phase 8
   without Lakebase.
8. `docs/07`, `08`, `11`, `13`: storage, handoff API and assignment move to the
   back; the agent has no database; `db/checkpointer.py` leaves the tree.

## Group 4: Tests

9. `tests/unit/`: `mask_sensitive` masks two card numbers and a CVV in one
   text; `conversation_language` uses the last long earlier message, skips
   short ones, and falls back to the country.
10. `tests/integration/test_graph.py`: history comes in the input, not from a
    thread; a card number in an earlier message never reaches the LLM; a short
    Portuguese reply after a long Portuguese message answers in Portuguese; two
    runs with the same `thread_id` share no messages.
11. `tests/e2e/test_invocations.py`: `POST /invocations` with a three-message
    history → the LLM receives all three; with 30 messages → it receives the
    last 20.
