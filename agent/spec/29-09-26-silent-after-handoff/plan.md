# Plan: David se calla después de derivar (lado agente)

It goes on top of `reliable-collection` (it touches `respond.py` and `main.py`), from `main` once that one is merged.

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `src/main.py` | existing | No deltas in use-case turns; `paused` turn |
| `src/graph/nodes/paused.py` | new | `paused(state)` decides whether the conversation is with an advisor |
| `src/graph/build.py`, `src/graph/edges.py`, `src/graph/state.py` | existing | gate → paused → classify, or END |
| `src/graph/nodes/respond.py` | existing | Handoff ends the round (already true; explicit with a test) |
| `src/schemas/turn_outputs.py` | existing | `paused` in `custom_outputs` |
| `src/db/session_repo.py` or `src/main.py` | existing | Read `custom_inputs.handled_by` |

---

## Group 1: No text in the handoff turn

1. `src/main.py`, `_process_agent_astream_events`: in the `messages` branch, don't emit `create_text_delta` when `turn["use_case"]` is set. The text still goes out in the `output_item.done` of the `updates` branch.
2. `src/graph/nodes/respond.py`: when `_hand_off` returns in the middle of a round, the rest of `reply.tool_calls` isn't executed. That's already how it works; add a comment and a test.

---

## Group 2: Paused conversation

3. `src/graph/state.py`: add `paused: bool`.
4. `src/graph/nodes/paused.py`, `paused(state) -> dict`:
   - `handled_by = state["session"].get("handled_by")`, taken from `custom_inputs.handled_by`.
   - If `handled_by == "ai_agent"`: `{"paused": False}`.
   - If `handled_by` has another value: `{"paused": True}`.
   - Without `handled_by`: look for the last assistant message equal to a `HANDOFF_REPLY` value. If there is one and no later message starts with `ADVISOR_PREFIX`, `{"paused": True}`; otherwise `{"paused": False}`.
5. `src/graph/build.py` and `src/graph/edges.py`: `gate` → (authenticated) → `paused` → `classify`, or `END` if `paused`.
6. `src/main.py`: pass `custom_inputs.get("handled_by")` into `session` (or a separate state key). Record `paused` from the updates in `turn`.
7. `src/schemas/turn_outputs.py`: `turn_custom_outputs(..., paused=False)` adds `"paused": paused`. In `main.streaming`:
   - When the turn is paused, the stream has no text items. `custom_outputs.paused=true` travels in the smallest event with no text content that carries `custom_outputs` (format decided: no text items, only `custom_outputs.paused`; w1:p1 doesn't save an empty message).
   - `non_streaming` returns `output: []` with `custom_outputs.paused: true`.

---

## Group 3: Tests

8. `tests/unit/test_paused.py`:
   - history without a handoff → false;
   - with the handoff and nothing after → true;
   - with the handoff and `[Asesor] …` after → false;
   - pt handoff → true;
   - `handled_by="ai_agent"` with the handoff → false;
   - `handled_by="human_queue"` without the handoff → true.
9. `tests/unit/test_turn_outputs.py`: `paused` true/false in `custom_outputs`.
10. `tests/integration/test_graph.py`:
    - A paused conversation doesn't call the classifier, the LLM or `tools_for` (ExplodingLLM, a failing Jev, `_exploding_tools_for`).
    - A handoff with another tool call in the same round doesn't execute it.
11. `tests/e2e/test_invocations.py`:
    - A use-case turn streams no `output_text.delta`.
    - A handoff turn whose LLM writes text alongside `hand_off_to_advisor` (`StreamingScriptedChatModel` with content plus tool call) only carries the fixed reply.
    - POST with the history after the handoff → no text item and `paused: true`.
    - The same with `custom_inputs.handled_by="ai_agent"` → normal answer.
