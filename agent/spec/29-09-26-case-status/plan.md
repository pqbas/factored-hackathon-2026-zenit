# Plan: Estado de un reclamo (bloque c)

Steps marked (WIP) already exist on `feat/pqbas-agent-case-status`. They are reviewed against `requirements.md`, not rewritten.

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `uc/bank_uc_consultas.sql` | existing | (WIP) New `get_cases(customer_id)` |
| `scripts/grant_app.sql` | existing | EXECUTE on the schema; (WIP) SELECT on `customer_cases` |
| `databricks.yml` | existing | (WIP) `uc_consultas_get_cases` EXECUTE resource |
| `src/db/session_repo.py` | existing | (WIP) `demo-mx-2` |
| `configs/routing.yaml` | existing | (WIP) CASE_STATUS as a use case with `handoff_reason: case_status`; final instructions |
| `src/tools/handoff.py` | existing | (WIP) `CaseStatusCase`, `_verify_case_status`, `_verified_charge` shared with complaints |
| `src/graph/nodes/respond.py` | existing | (WIP) `facts.case_id` from `complaint_id` |
| `src/prompts/situations.py`, `src/prompts/messages.py` | existing | (WIP) remove `not_yet_available` / `NOT_YET_AVAILABLE` |
| `src/llm/fallback.py` | existing | (WIP) confirmation rule in `menu_rule_intent` |
| `src/llm/jev.py`, `src/llm/llm_classifier.py` | existing | (WIP) cancellation reasons stay RETENTION |
| `src/prompts/system.md` | existing | (WIP) exact confirmation questions in pt |
| `../back/scripts/scenarios/06-estado-reclamo.json` | existing | Full 3.D2 flow with `demo-mx-2` |

---

## Group 1: Data (UC)

1. (WIP) `uc/bank_uc_consultas.sql`: `get_cases(customer_id)` returns `complaint_id`, `creation_date`, `case_type`, `category`, `subcategory`, `claimed_amount`, `currency`, `priority`, `status`, `is_open`, `resolution_date`, `resolution` and `compensation_granted`. It reads `bank_gold.customer_cases` filtered by `customer_id`, ordered by `creation_date DESC`, `LIMIT 10`.
2. (WIP) `scripts/grant_app.sql`: `GRANT SELECT ON TABLE ${catalog}.bank_gold.customer_cases`. EXECUTE on the schema already comes from PR #77.
3. (WIP) `databricks.yml`: resource `uc_consultas_get_cases` (FUNCTION, EXECUTE).
4. Apply with `uv run python scripts/apply_uc.py uc/bank_uc_consultas.sql`. Then run `uv run python scripts/apply_uc.py scripts/grant_app.sql sp=<App SP>`, always after the first, because the functions are recreated.

---

## Group 2: Case status and its handoff

5. (WIP) `configs/routing.yaml`, CASE_STATUS route: `destination: load_context`, `schemas: [bank_uc_consultas]`, `handoff_reason: case_status`. The instructions cover:
   - proposing or listing the complaints;
   - the fixed status texts;
   - never answering timelines or adding answers;
   - recognizing "quiero saber cuándo lo van a resolver" as the need;
   - the summary plus the exact question.
6. Rework the "Qué necesita" part of the instructions until `CLASSIFIER=llm` and `jev` both show the summary and the exact question after "quiero saber cuándo lo van a resolver". Today it asks "¿Qué necesitas saber?" again, or adds a second question.
   - If the instructions alone don't make it reliable, fall back to one extra sentence in step 2 of the instructions. After giving the status, David asks "¿Necesitas algo más sobre este reclamo, como un plazo o una respuesta?". Whatever the customer answers to that is what they need.
7. (WIP) `src/tools/handoff.py`: `CaseStatusCase(complaint_id?, card_last4?, transaction_date?, merchant?, amount?, need)`.
   - `_verify_case_status` checks `complaint_id` against `get_cases`, or the charge through `_verified_charge`.
8. (WIP) `src/graph/nodes/respond.py`: `facts.case_id = verified_data.get("complaint_id")`.
   - `_fetch_missing_rows` already fetches `get_cases` for a known case.
9. (WIP) `src/prompts/situations.py` and `src/prompts/messages.py`: drop `not_yet_available` / `NOT_YET_AVAILABLE`, since no menu option is pending any more.
10. (WIP) `src/db/session_repo.py`: `demo-mx-2` → `CLI-0IY07CEBUL79`, México. Ask w1:p1 to add it to the back's demo customers.

---

## Group 3: Confirmation rule

11. (WIP) `src/llm/fallback.py`: `_AFFIRMATIVE`, `_TO_ADVISOR`, `_CONFIRMATIONS` and `_confirmed_operation(previous)`. `menu_rule_intent` returns the operation when the text is a yes and the last line of the previous reply is a question that passes the complaint, the request or the query to an advisor.
12. (WIP) `src/llm/jev.py` and `src/llm/llm_classifier.py`: the context instruction says a cancellation reason stays RETENTION even if it mentions fees or charges.
13. (WIP) `src/prompts/system.md`: the exact confirmation questions in Portuguese.

---

## Group 4: Simulator

14. `../back/scripts/scenarios/06-estado-reclamo.json`: `sessionToken` `demo-mx-2`, messages `["hola", "D", "2", "el de octubre", "quiero saber cuándo lo van a resolver", "sí, confirmo"]`, with a description of the 3.D2 flow.

---

## Group 5: Tests

15. `tests/unit/test_handoff.py` (WIP, complete if needed):
    - a known case is verified with the bank's values;
    - an unknown `complaint_id` is rejected;
    - a case not in `get_cases` is verified by its charge;
    - a case without the complaint or the charge asks for it;
    - movements without a merchant don't break the check.
16. `tests/unit/test_fallback.py` (WIP):
    - a yes to each confirmation question (es and pt, exact and paraphrased) keeps COMPLAINT, RETENTION or CASE_STATUS;
    - a yes to any other question isn't a rule.
17. `tests/unit/test_routing.py` (WIP): CASE_STATUS is a `load_context` route with `handoff_reason` `case_status`.
18. `tests/integration/test_graph.py` (WIP): a case-status handoff carries the bank's `case_id` and status.
    - Add: a "sí" after the CASE_STATUS confirmation question never reaches the classifier and ends in the handoff.
19. `tests/e2e/test_invocations.py`: POST `/invocations` with a CASE_STATUS confirmation turn and faked `get_cases`. It returns the fixed handoff reply, and `custom_outputs.handoff` has reason `case_status` and `facts.case_id`.
