# Plan: turn signals for the evaluation runner

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `src/schemas/turn_outputs.py` | existing | `usage`, `model`, `prompt_version`, `classifier` in `custom_outputs` |
| `src/prompts/version.py` | new | `prompt_version()` hash of the prompt files |
| `src/main.py` | existing | Usage callback on the graph run; pass the new signals |
| `src/db/session_repo.py` | existing | `Session.fail_tools` from the session entry |
| `src/tools/bind_customer.py`, `src/graph/nodes/respond.py` | existing | Failing tools for the session's `fail_tools` |
| `configs/eval_sessions.json` | new | The tokens of the evaluation cases |
| `README.md` | existing | How to start the agent for the runner |

---

## Group 1: Signals in custom_outputs

1. `src/prompts/version.py`, `prompt_version() -> str`: the sha256 of the sorted contents of `src/prompts/*` and `settings.routing_path`, first 12 hex characters, cached with `lru_cache`.
2. `src/schemas/turn_outputs.py`: `turn_custom_outputs(..., usage=None, model=None, prompt_version=None, classifier=None)` adds the four keys in both branches (the gate-rejected one too).
3. `src/main.py`:
   - In `streaming`, create a `UsageMetadataCallbackHandler` per request and pass it as `config={"callbacks": [handler]}` to `graph.astream`.
   - After the run, `usage` is the sum of `input_tokens` and `output_tokens` over `handler.usage_metadata.values()`. It is `{0, 0}` when the turn had no LLM call, and `None` when the LLM ran but reported nothing.
   - Pass `usage`, `settings.llm_endpoint`, `prompt_version()` and `settings.classifier`.
   - "The LLM ran" is tracked in the same handler: subclass it or count `on_llm_start`.

---

## Group 2: fail_tools

4. `src/db/session_repo.py`: `Session.fail_tools: tuple[str, ...] = ()`, read from the entry's `fail_tools`, and included in `as_dict()`.
5. `src/tools/bind_customer.py`: `bind_customer(tool, customer_id, fail=False)`. When `fail` is true, the wrapper raises `TimeoutError("The SQL warehouse didn't answer")` without calling the tool.
6. `src/graph/nodes/respond.py`, `_bound_tools`: pass `fail=tool.name.split("__")[-1] in state["session"].get("fail_tools", ())`.

---

## Group 3: Sessions file and docs

7. `configs/eval_sessions.json`: the 15 tokens of requirement 6, with `expires_at` in 2099, except `demo-expired`, which uses 2020.
8. `README.md`: one line on starting the agent for the runner, `DEMO_SESSIONS_JSON="$(cat configs/eval_sessions.json)" CLASSIFIER=llm uv run start-server --port 8001`.

---

## Group 4: Tests

9. `tests/unit/`:
   - `prompt_version` is stable and 12 characters long;
   - `turn_custom_outputs` carries the four keys;
   - `resolve_session` reads `fail_tools`;
   - `bind_customer(fail=True)` raises without calling the tool;
   - `configs/eval_sessions.json` has the 15 tokens and `demo-tool-down` fails `get_products`.
10. `tests/integration/test_graph.py`: in a session with `fail_tools=["get_products"]`, `get_products` isn't called and the LLM gets the error as a tool result.
11. `tests/e2e/test_invocations.py`: over `/invocations`, with a fake chat model that reports `usage_metadata`, `custom_outputs.usage` is the sum across the turn's calls, and `model`, `prompt_version` and `classifier` are present. A paused turn and a gate-rejected turn carry `usage: {0, 0}`.
