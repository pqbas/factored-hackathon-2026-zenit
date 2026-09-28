# Plan: Conversation without a use case

## Code changes

| Module                        | Origin          | Change                                                                    |
| ----------------------------- | --------------- | ------------------------------------------------------------------------- |
| `configs/routing.yaml`        | —               | Adds `option` (es/pt) to three intents; `CANCEL` goes to `cancel`.        |
| `src/schemas/routing.py`      | —               | Adds an optional `option` field and `render_options(routes, language)`.   |
| `src/prompts/situations.py`   | `docs/05` §5.3  | New; the situation instructions and `situation_for`.                      |
| `src/prompts/system.md`       | —               | Makes the ban on stating account data explicit.                           |
| `src/prompts/messages.py`     | —               | Adds `CANCEL_REPLY` in `es` and `pt`.                                     |
| `src/graph/nodes/cancel.py`   | —               | New; fixed reply, no LLM.                                                 |
| `src/graph/nodes/respond.py`  | —               | Adds the situation instruction and the options to the system prompt.      |
| `src/graph/edges.py`          | `docs/05` §5.2  | `dispatch` checks cancel, then confidence, then the intent.               |
| `src/graph/build.py`          | —               | Adds the `cancel` node; passes `routes` and `intent_threshold`.           |
| `src/llm/fallback.py`         | —               | A keyword match sets `intent_confidence` to 1.0.                          |
| `src/config.py`, `src/main.py` | —              | `INTENT_THRESHOLD` is read and passed to `build_graph`.                   |

---

## Group 1: Routing and options

1. In `src/schemas/routing.py`:
   - `IntentRoute` gets `option: dict[str, str] | None = None`. When set, it
     needs both an `es` and a `pt` key.
   - Add `render_options(routes, language) -> str`: a numbered list of each
     route's `option[language]`, in file order. The language `other` uses
     `es`.

2. In `configs/routing.yaml`:
   - Add an `option` to three intents:
     - `GENERAL_INQUIRY`: "Consultar el saldo y el límite de tu tarjeta o
       cuenta" / "Consultar o saldo e o limite do seu cartão ou conta"
     - `COMPLAINT`: "Presentar un reclamo, por ejemplo un cargo que no
       reconoces" / "Registrar uma reclamação, por exemplo uma cobrança que
       você não reconhece"
     - `CASE_STATUS`: "Ver el estado de un reclamo" / "Ver o status de uma
       reclamação"
   - Change `CANCEL` to `destination: cancel`.

3. In `src/config.py`, add `intent_threshold` (`INTENT_THRESHOLD`, default
   `0.5`).

---

## Group 2: Prompts

4. In `src/prompts/system.md`, add a paragraph: in this conversation the
   assistant has no access to the customer's accounts, cards or cases. It
   never states a balance, movement, limit, card status or case status, and
   never claims to have done something on the account.

5. Create `src/prompts/situations.py`:
   - `SITUATIONS: dict[str, str]` holds the Spanish instructions for
     `greeting`, `goodbye`, `out_of_scope`, `clarify` and `unavailable`,
     following the table in `docs/05` §5.3. Every instruction except
     `goodbye` ends by asking the model to present the options below.
   - `unavailable` says that this option isn't available in the chat yet,
     and offers the listed options.
   - `situation_for(classification: dict, intent_threshold: float) -> str`
     returns the first match of:
     1. `clarify` if `intent_confidence < intent_threshold`
     2. `greeting`, `goodbye` or `out_of_scope` for the intents `GREETING`,
        `GOODBYE` and `OUT_OF_SCOPE`
     3. `unavailable` for any other intent

6. In `src/prompts/messages.py`, add `CANCEL_REPLY` in `es` and `pt`, for
   example "Listo, lo dejamos ahí. Si necesitas algo más, escríbeme."

---

## Group 3: Graph

7. Create `src/graph/nodes/cancel.py` with `cancel(state)`. It returns an
   `AIMessage` with `CANCEL_REPLY` in the classification's language (`other`
   uses `es`). It follows the pattern of `src/graph/nodes/gate.py`.

8. In `src/graph/nodes/respond.py`, the signature becomes
   `respond(state, llm, routes, intent_threshold)`. The system prompt is:
   - `system.md`
   - `SITUATIONS[situation_for(...)]`
   - the options block, "Opciones:\n" followed by
     `render_options(routes, language)`, omitted for `goodbye`
   - the Phase 2 language line

9. In `src/graph/edges.py`, `dispatch` becomes
   `dispatch(state, routes, threshold, intent_threshold)` and returns:
   1. `END` if the message is blocked (as today)
   2. the `CANCEL` route's destination if the intent is `CANCEL`
   3. `"respond"` if `intent_confidence < intent_threshold`
   4. the intent's route destination, or `"respond"` for an unknown intent

10. In `src/graph/build.py`:
    - Add `_CANCEL = "cancel"`, so `GRAPH_NODES = {_RESPOND, _CANCEL}`.
    - Add the `cancel` node with `cancel → END`, and add it to the
      conditional-edge mapping.
    - The signature becomes `build_graph(llm, checkpointer, jev, routes,
      threshold, intent_threshold)`.

11. In `src/llm/fallback.py`, `fallback_classify` sets
    `intent_confidence=1.0` when a keyword pattern matched and `0.0` for the
    default `OUT_OF_SCOPE`.

12. In `src/main.py`, pass `settings.intent_threshold` to `build_graph`.

13. Update `docs/05-dispatch.md` §5.7 Estado: the agent without a use case,
    `cancel` and the confidence check exist; `load_context` and `handoff` are
    still pending.

---

## Group 4: Tests

14. `tests/unit/`:
    - `test_routing.py`:
      - The `option` field loads.
      - An `option` missing `pt` fails.
      - `render_options` lists the three options in order, in `es` and
        `pt`, and `other` falls back to `es`.
    - `test_situations.py`:
      - `situation_for` returns `clarify` below the threshold, even for
        `GREETING`.
      - It returns `greeting`, `goodbye` and `out_of_scope` for their
        intents.
      - It returns `unavailable` for `GENERAL_INQUIRY` and `HUMAN_AGENT`.
    - `test_dispatch.py`:
      - `CANCEL` with low confidence → `cancel`.
      - Low confidence → `respond`.
      - `CANCEL` → `cancel`.
      - The existing cases still pass.
    - `test_fallback.py`: "hola" → `GREETING` with confidence 1.0; plain
      text → `OUT_OF_SCOPE` with 0.0.
    - `test_cancel.py`: `cancel` returns `CANCEL_REPLY` in `es` and `pt`.

15. In `tests/integration/test_graph.py`, add a recording fake LLM that
    saves the messages it received, and update `build_graph` calls. Cases:
    - `GREETING` → the system prompt has the greeting instruction and the
      three options.
    - `GENERAL_INQUIRY` → the system prompt has the `unavailable`
      instruction.
    - Confidence 0.2 → the system prompt has the `clarify` instruction.
    - `GOODBYE` → no options block.
    - `CANCEL` → `CANCEL_REPLY`, and the LLM is not called (`ExplodingLLM`).
    - `pt` greeting → the options are in Portuguese.

16. In `tests/e2e/test_invocations.py`, add cases through
    `POST /invocations`, with the Jev mock answering each intent:
    - "cancelar" (Jev `CANCEL`) → `CANCEL_REPLY` in `output`.
    - "hola" (Jev `GREETING`) → the fake LLM text in `output`, and the
      recorded system prompt lists the options.
