# Plan: Recolección y confirmación confiables

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `src/llm/fallback.py` | existing | `menu_rule_intent` also reports that the match was a confirmation |
| `src/graph/nodes/classify.py`, `src/graph/state.py` | existing | New `confirmation` state flag |
| `src/graph/nodes/respond.py` | existing | Forced handoff on confirmation; collector for 3.C and 3.D1 |
| `src/tools/collector.py` | new | Field extraction, next missing field, fixed questions and summary |
| `src/prompts/messages.py` | existing | Fixed questions and summary templates, es/pt |
| `src/tools/handoff.py` | existing | Optional-field versions of `ComplaintCase` and `RetentionCase` |

---

## Group 1: Forced handoff on confirmation

1. `src/llm/fallback.py`: add `is_confirmation(text, previous_reply) -> bool`, the same test `menu_rule_intent` uses for `_AFFIRMATIVE` plus `_confirmed_operation`.
2. `src/graph/state.py`: add `confirmation: bool`.
   - `src/graph/nodes/classify.py`: set `update["confirmation"] = is_confirmation(text, previous_reply)` on every turn.
3. `src/graph/nodes/respond.py`, `_respond_with_tools`: when `state.get("confirmation")` and `route.handoff_reason`, the first round uses `llm.bind_tools(tools, tool_choice=HANDOFF_TOOL_NAME)` instead of `"required"`.
   - The rest of the loop is unchanged: `_fetch_missing_rows`, `verify_case` and `_hand_off`.

---

## Group 2: Collector for 3.C and 3.D1

4. `src/tools/handoff.py`: add `PartialComplaintCase` and `PartialRetentionCase`. They have the same fields, all `Optional`, and `complaint_type` keeps its enum.
5. `src/prompts/messages.py`: fixed es/pt texts.
   - `ASK_CARD`: "¿De qué tarjeta es el cargo?" plus the list of cards.
   - `ASK_CHARGE`: "¿Cuál es el cargo?" plus the list of movements.
   - `ASK_TYPE`: "¿Qué pasó? No lo reconozco / me cobraron dos veces / el monto es distinto".
   - `ASK_DESCRIPTION`: "Cuéntame brevemente lo que pasó".
   - `ASK_PRODUCT`: "¿Qué producto quieres cancelar?" plus the list.
   - `ASK_REASON`: "¿Por qué quieres cancelarlo?".
   - `NOT_THE_CUSTOMERS`: "no es tuya" / "no aparece".
   - `COMPLAINT_SUMMARY` and `RETENTION_SUMMARY`, ending in the exact confirmation question.
6. `src/tools/collector.py`:
   - `extract_fields(llm, reason, messages, timeout)`: structured output over the conversation with the `Partial*` schema. Raises `CollectorUnavailable` on error or timeout.
   - `next_step(reason, fields, rows_by_tool) -> (kind, text)`: calls nothing. It checks each given field against the rows and returns the fixed question for the first missing or mismatching field, or the summary when everything is there.
   - `format_cards(rows)` and `format_movements(rows)` list options as "terminada en 1070 (USD)" and "08/06/2026 · Internet Plus · 329.44 USD".
7. `src/graph/nodes/respond.py`: when `route.handoff_reason in ("complaint", "retention")` and the turn isn't a confirmation, run the collector.
   - Fetch the rows the next step needs with `_fetch_missing_rows`. Reuse it with the fields found (card → `list_transactions` of that card).
   - `extract_fields` → `next_step` → a fixed `AIMessage` in the customer's language.
   - On `CollectorUnavailable`, log it and continue with today's `_respond_with_tools`.
8. `configs/routing.yaml`: the COMPLAINT and RETENTION instructions stay as the fallback path. Add one sentence noting that the collector normally asks the questions.

---

## Group 3: Tests

9. `tests/unit/test_collector.py`:
   - `next_step` for each missing field (complaint: card, charge, type, description; retention: product, reason);
   - a card that isn't the customer's;
   - a charge that isn't in the movements;
   - a complete case → summary with the exact question;
   - pt texts;
   - option formatting.
10. `tests/unit/test_fallback.py`: `is_confirmation` true for the three confirmation questions (exact and paraphrased), false for another question or text.
11. `tests/integration/test_graph.py`:
    - A COMPLAINT turn with a fake extractor returning card and charge asks the fixed type question and never calls the tool-loop LLM.
    - A second turn with type added asks for the description.
    - A confirmation turn binds `tool_choice="hand_off_to_advisor"` and hands off.
    - An extractor that raises falls back to the LLM path.
12. `tests/e2e/test_invocations.py`: POST `/invocations` for a whole 3.C conversation. The extractor and the UC tools are faked. The answers follow the fixed questions in order, and the last turn returns the handoff.
