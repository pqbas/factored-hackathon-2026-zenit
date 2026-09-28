# Plan: Message classification

## Code changes

| Module                           | Origin                                   | Change                                                              |
| -------------------------------- | ---------------------------------------- | ------------------------------------------------------------------- |
| `configs/routing.yaml`           | `docs/05` §5.1                           | New; intents, descriptions, examples and destination.               |
| `src/schemas/routing.py`         | —                                        | New; loads and validates `routing.yaml`.                            |
| `src/schemas/classification.py`  | —                                        | New; `Classification` model and the guardrail and sentiment labels. |
| `src/llm/jev.py`                 | —                                        | New; one `httpx` call to Jev with four questions.                   |
| `src/llm/fallback.py`            | `legacy/.../nlu.py`, `legacy/.../i18n.py` | Ported; guardrail rules, intent keywords and language detection.    |
| `src/graph/nodes/classify.py`    | —                                        | New; rules, Jev, fallback, refusal and masking.                     |
| `src/graph/edges.py`             | `docs/05` §5.2                           | `after_gate` goes to `classify`; new `dispatch`.                    |
| `src/graph/state.py`             | —                                        | Adds `classification`.                                              |
| `src/graph/build.py`             | —                                        | Adds `classify`; injects the Jev client and the routes.             |
| `src/graph/nodes/respond.py`     | —                                        | Adds the detected language to the system prompt.                    |
| `src/prompts/messages.py`        | —                                        | Adds `GUARDRAIL_REPLIES` in `es` and `pt`.                          |
| `src/config.py`                  | —                                        | Adds the Jev, threshold and routing settings.                       |
| `src/main.py`                    | —                                        | Builds the Jev client and the routes; tags the trace.               |

---

## Group 1: Config and routing

1. In `pyproject.toml`, declare `httpx`, `pydantic` and `pyyaml` as direct
   dependencies, then run `uv lock` and `uv sync`.

2. In `src/config.py`, add to `Settings`:
   - `jev_api_key` (`JEV_API_KEY`, default `None`)
   - `jev_url` (`JEV_URL`, default `https://api.typesafe.ai/v1/systemone`)
   - `jev_timeout_seconds` (`JEV_TIMEOUT_SECONDS`, default `2.0`)
   - `guardrail_threshold` (`GUARDRAIL_THRESHOLD`, default `0.7`)
   - `routing_path` (`ROUTING_PATH`, default `configs/routing.yaml`)

3. In `.env.example`, add `JEV_API_KEY=` with a comment: it goes in a secret
   scope in Databricks and never in the repo.

4. Create `configs/routing.yaml` with the ten intents from `docs/05` §5.1:
   `GENERAL_INQUIRY`, `COMPLAINT`, `CASE_STATUS`, `HUMAN_AGENT`, `COMMERCIAL`,
   `RETENTION`, `CANCEL`, `GREETING`, `GOODBYE` and `OUT_OF_SCOPE`.
   - Each entry has a `description` and 2–3 `examples` in Spanish and
     Portuguese.
   - Each entry has `destination: respond`.

5. Create `src/schemas/routing.py`:
   - A `IntentRoute(BaseModel)` with `intent`, `description`, `examples` and
     `destination`.
   - `load_routing(path, allowed_destinations) -> list[IntentRoute]`, which
     fails on:
     - an empty file
     - a duplicate intent
     - a destination outside `allowed_destinations`

---

## Group 2: Classification

6. Create `src/schemas/classification.py`:
   - `GUARDRAIL_CATEGORIES` maps `OK`, `PROMPT_INJECTION`,
     `THIRD_PARTY_DATA`, `ABUSE`, `SENSITIVE_DATA` and `CUSTOMER_RISK` to a
     one-line description; Jev uses these as `criteria`.
   - `SENTIMENT_LEVELS` = `["very_negative", "negative", "neutral",
     "positive"]`.
   - `Classification(BaseModel)` with fields:
     - `guardrail` and `guardrail_probability`
     - `language` (`es`, `pt` or `other`)
     - `intent` and `intent_confidence`
     - `sentiment`
     - `source` (`rules`, `jev` or `fallback`)
   - `Classification` has a `blocked(threshold)` helper.

7. Create `src/llm/fallback.py`:
   - Port `normalize` and `detect_language` from
     `legacy/agent_server/dispute/i18n.py`.
   - `check_guardrail_rules(text) -> tuple[str, str] | None` returns the
     category and the masked text. It matches:
     - injection phrases, such as "ignora tus instrucciones" or "ignore
       previous instructions"
     - a 13–19 digit number that passes Luhn
     - "cvv" or "contraseña"/"senha" followed by a value
   - `fallback_classify(text, intents) -> Classification` has `source`
     `fallback`, guardrail `OK`, confidence `0.0` and sentiment `neutral`.
     - The intent keywords come from `baseline_understand` in
       `legacy/agent_server/dispute/nlu.py`: cancel, human, greeting and
       complaint.
     - The keywords are mapped to intents in `intents`.
     - Anything else is `OUT_OF_SCOPE`.

8. Create `src/llm/jev.py`:
   - The class is `JevClient(api_key, url, timeout, transport=None)`.
   - `async classify(text, routes) -> Classification` sends one request with
     `model: jev-latest`, the text as `state`, and four questions:
     - `guardrail` (choice over `GUARDRAIL_CATEGORIES`)
     - `language` (choice over `es`/`pt`/`other`)
     - `intent` (choice with each route's description plus its examples)
     - `sentiment` (score over `SENTIMENT_LEVELS`)
   - Parse `answers` into `Classification(source="jev")`:
     - `guardrail_probability` is `probabilities[choice]`.
     - `intent_confidence` is `confidence`.
     - An unknown category is treated as `OK` and logged.
   - Raise `JevUnavailable` on a timeout, an HTTP error status or a missing
     answer.
   - `transport` exists only so tests can pass an `httpx.MockTransport`.

---

## Group 3: Graph

9. In `src/prompts/messages.py`, add
   `GUARDRAIL_REPLIES[category][language]` for the five non-`OK` categories,
   in `es` and `pt`; `other` uses `es`. Base the wording on `docs/04` §4.2:
   - third-party data: the agent only sees the customer's own data
   - sensitive data: the customer should not share it, and it was not saved
   - customer risk: don't transfer anything; an advisor will contact them

10. In `src/graph/state.py`, add `classification: dict | None`.

11. Create `src/graph/nodes/classify.py` with
    `async classify(state, jev, routes, threshold)`:
    - Take the last `HumanMessage`.
    - Run `check_guardrail_rules` first. On a match, build
      `Classification(source="rules", guardrail_probability=1.0)` with the
      language from `detect_language`, and skip Jev.
    - Otherwise call `jev.classify`. On `JevUnavailable`, or when `jev` is
      `None`, use `fallback_classify`.
    - If `classification.blocked(threshold)`, return the
      `GUARDRAIL_REPLIES` `AIMessage`.
    - For `SENSITIVE_DATA`, also return a `HumanMessage` with the same `id`
      and the masked text, so `add_messages` replaces the original before
      the checkpoint.
    - Always return `{"classification": classification.model_dump()}`.
    - Tag the current MLflow trace with the classification fields
      (`mlflow.update_current_trace(tags=...)`), prefixed `classify.`.

12. In `src/graph/edges.py`:
    - `after_gate` returns `"classify"` instead of `"respond"`.
    - Add `dispatch(state, routes)`. It returns `END` when `classify`
      already replied (blocked), and otherwise the `destination` of the
      intent's route, or `"respond"` for an unknown intent.

13. In `src/graph/nodes/respond.py`, append to the system prompt a line
    telling the model to answer in the detected language (`es` → Spanish,
    `pt` → Portuguese; `other` leaves the prompt unchanged).

14. In `src/graph/build.py`:
    - The signature becomes `build_graph(llm, checkpointer, jev, routes,
      threshold)`.
    - Graph: `START → gate → classify`, conditional `dispatch` to `respond`
      or `END`, then `respond → END`.
    - Export `GRAPH_NODES = {"respond"}` so `load_routing` validates against
      it.

---

## Group 4: Server

15. In `src/main.py`, load the routes once at import with
    `load_routing(settings.routing_path, GRAPH_NODES)`, so a bad YAML fails
    at startup.
    - Build `JevClient` only when `settings.jev_api_key` is set, otherwise
      `None`.
    - Pass both to `build_graph`.
    - `classify` adds no streaming (it isn't in `_STREAMING_NODES`); its
      refusal reaches the client through the `updates` branch.

16. Update the Estado sections:
    - `docs/04-guardrails.md` §4.5: `classify` exists with Jev, rules and
      fallback; handoff for abuse and risk is still pending.
    - `docs/05-dispatch.md` §5.7: `dispatch` reads `routing.yaml`; only
      `respond` exists.

---

## Group 5: Tests

17. `tests/unit/`:
    - `test_routing.py`:
      - `configs/routing.yaml` loads.
      - A duplicate intent fails.
      - An unknown destination fails.
    - `test_fallback.py`:
      - Luhn card number → `SENSITIVE_DATA`, with the number masked.
      - Injection phrase → `PROMPT_INJECTION`.
      - "quiero hablar con un asesor" → `HUMAN_AGENT`.
      - Portuguese text → `pt`.
      - Plain text → no rule match.
    - `test_jev.py`, using `httpx.MockTransport`:
      - The request has four questions, the key as a Bearer header, and the
        intent `criteria` from routes.
      - A sample response parses to `Classification`.
      - An unknown category → `OK`.
      - A timeout and a 529 each raise `JevUnavailable`.
    - `test_dispatch.py`:
      - A blocked turn → `END`.
      - An intent → its route's destination.
      - An unknown intent → `respond`.

18. In `tests/integration/test_graph.py`, add a fake Jev (a class with
    `async classify` returning a fixed `Classification`) and update the
    existing tests to the new `build_graph` signature. New cases:
    - Jev returns `PROMPT_INJECTION` at 0.9 → fixed refusal, and the LLM is
      not called (`ExplodingLLM`).
    - Same category at 0.4 → the LLM answers, and `classification` is in the
      state.
    - A card number in the message → refusal, and the saved human message is
      masked. Jev is not called (the fake raises if called).
    - Jev raises `JevUnavailable` → the LLM answers, with `source ==
      "fallback"`.
    - Jev returns `pt` → the system prompt the LLM received mentions
      Portuguese.

19. Create `tests/e2e/test_invocations.py` with FastAPI's `TestClient` on
    `src.main.app`:
    - Monkeypatch `get_chat_model` to a `GenericFakeChatModel`.
    - Monkeypatch the Jev client to an `httpx.MockTransport`-backed
      `JevClient`.
    - Leave `LAKEBASE_INSTANCE_NAME` empty, so MemorySaver is used.
    - Cases:
      - `POST /invocations` with `demo-mx-1` and an injection message → the
        refusal text in `output`.
      - A normal message → the fake LLM text.
      - The Jev transport raising `httpx.ReadTimeout` → the fake LLM text.
