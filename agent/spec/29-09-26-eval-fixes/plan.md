# Plan: David meets the 40 evaluation cases

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `configs/routing.yaml` | existing | Movements with one product; COMPLAINT requires a charge; OUT_OF_SCOPE examples; CASE_STATUS question when there are no complaints |
| `src/prompts/messages.py` | existing | `TOOL_DOWN`, `NOT_AVAILABLE`, `ASK_CASE_CHARGE` (es, pt) |
| `src/prompts/situations.py` | existing | COMMERCIAL → `not_available` situation |
| `src/llm/fallback.py` | existing | Portuguese markers; exact confirmation phrases; `case_status_follow_up` rule |
| `src/graph/nodes/classify.py` | existing | Language override; CASE_STATUS continuity |
| `src/graph/nodes/respond.py` | existing | Fixed reply when a UC tool fails |
| `src/tools/collector.py` | existing | Retention: product by the type the customer named |

---

## Group 1: Queries (#03, #09, #33, #08, #27, #28, #40)

1. `configs/routing.yaml`, GENERAL_INQUIRY, "Movimientos":
   - "If they have a single product of that type, call list_transactions with it right away, without asking."
   - The closing question is only allowed after the movements, never instead of them.
2. `src/llm/fallback.py`: add Portuguese markers (`quanto`, `tenho`, `poupanca`, `cartao`, `quero`, `voce`, `minha`, `meu`, `sim`) to `_PT_MARKERS`. Check that every current `detect_language` test still passes.
3. `src/graph/nodes/classify.py`: after the classification, if `detect_language(text)` is `pt` or `es` and differs from `classification.language`, the language is the detector's.
4. `src/prompts/messages.py`: `TOOL_DOWN = {"es": "Ahora no puedo consultar esa información.", "pt": "Agora não consigo consultar essa informação."}`.
5. `src/graph/nodes/respond.py`:
   - In `_respond_with_tools`, when a UC tool raises (not `hand_off_to_advisor`), end the turn with `TOOL_DOWN[language]` and no further LLM call.
   - In `_collect`, when `_fetch_missing_rows` reports a failed fetch, return the same text: make it return the names that failed.
6. `src/prompts/messages.py`: `NOT_AVAILABLE = {"es": "Esa consulta todavía no está disponible en este chat.", "pt": "Essa consulta ainda não está disponível neste chat."}`.
7. `src/prompts/situations.py`: COMMERCIAL → situation `not_available`, whose fixed reply is `NOT_AVAILABLE` plus the menu. OUT_OF_SCOPE stays `out_of_menu`.
8. `configs/routing.yaml`:
   - COMMERCIAL: add loans, debit card, payment date, minimum payment, total debt and transfers to the description, with the example "quiero un préstamo".
   - GENERAL_INQUIRY: narrow the description to balances, limits and movements of the customer's cards and savings accounts.
   - OUT_OF_SCOPE: add the example "¿cuál es el tipo de cambio hoy?".

---

## Group 2: Cancelling by product type (#17)

9. `src/tools/collector.py`, `_retention_step`:
   - When `last4` is None, look at the customer's messages (`_human_texts`) for a kind: `tarjeta|cartao` → products whose `product_type` starts with "Tarjeta"; `cuenta|ahorro|conta|poupanca` → "Cuenta".
   - If exactly one product of that kind, take it. If several, `ASK_PRODUCT` lists only those.
   - The reason check stays as it is, so a reason already given goes straight to the summary.

---

## Group 3: Complaint status (#20, #21, #22)

10. `src/llm/fallback.py`, `_CONFIRMATIONS`: match the exact phrases:
    - `pasar tu consulta|passar sua consulta` → CASE_STATUS;
    - `pasar tu solicitud|passar sua solicitacao` → RETENTION;
    - `pasar tu reclamo|passar sua reclamacao` → COMPLAINT.

    Update the test cases in `tests/unit/test_fallback.py` that used free wording.
11. `src/llm/fallback.py`, `case_status_follow_up(text, previous_reply) -> bool`: true when the last line of the previous reply has "?" and `reclamo|reclamacao` but not `asesor|atendente`, and the text isn't a menu letter, "menú" or a CANCEL rule match.
12. `src/graph/nodes/classify.py`: after the confirmation rule and the menu rules, if `case_status_follow_up` holds, classify as CASE_STATUS with `source="rules"`, without calling the classifier. Keep the language from the detector or the previous turn.
13. `src/prompts/messages.py`: `ASK_CASE_CHARGE` (es, pt).
14. `configs/routing.yaml`, CASE_STATUS:
    - With no complaints in get_cases, the reply is "No encuentro reclamos registrados." followed by `ASK_CASE_CHARGE`. The routing text quotes it.
    - Both the listing and the status end with a question that mentions "reclamo", so rule 11 applies: "¿Sobre cuál reclamo quieres saber?" and "¿Necesitas algo más sobre este reclamo?".

---

## Group 4: Ambiguous problem (#26)

15. `configs/routing.yaml`: the COMPLAINT description requires the customer to mention a charge (unrecognized, duplicate or different amount). Add "tengo un problema con mi tarjeta" as an OUT_OF_SCOPE example.

---

## Group 5: Tests

16. `tests/unit/`:
    - `detect_language` for the §7 Portuguese messages;
    - the exact confirmation phrases, where free wording no longer matches;
    - `case_status_follow_up` true after "¿Necesitas algo más sobre este reclamo?", false after a menu letter or "menú";
    - `_retention_step` takes the only card and lists only the cards when there are several;
    - `situation_for` COMMERCIAL → `not_available`.
17. `tests/integration/test_graph.py`:
    - a failing `get_products` gives `TOOL_DOWN` and no handoff;
    - a follow-up after a status question is CASE_STATUS without calling the classifier (exploding classifier);
    - a Portuguese message classified "es" is answered with the pt reminder;
    - retention "cerrar mi tarjeta porque la anualidad es muy cara" with one card gives the summary, and "sí, confirmo" hands off.
18. `tests/e2e/test_invocations.py`: #40 over `/invocations` with a failing tool gives the exact text and `handoff: null`; COMMERCIAL gives `NOT_AVAILABLE` plus the menu.

---

## Group 6 (pending the user's OK): classifier timeouts

19. Pending OK, not implemented in this phase unless w1:p4 confirms.
    - Don't reclassify while the complaint or retention collector is in progress: the previous reply is one of the collector's fixed questions (`ASK_CARD`, `ASK_CHARGE`, `ASK_TYPE`, `ASK_DESCRIPTION`, `ASK_PRODUCT`, `ASK_REASON`). The turn keeps that operation, with the same exceptions as rule 11.
    - `CLASSIFIER_TIMEOUT_SECONDS` and `EXTRACTION_TIMEOUT_SECONDS` default to 8.0.

---

## Group 7 (annex, pending approval of the option): grounding guard

20. `configs/routing.yaml` and `src/schemas/routing.py`: `IntentRoute.grounding: list[GroundingKind] = []`, where `GroundingKind = {kind, tool, asks: [regex], shows: regex}`.
    - GENERAL_INQUIRY: `movements` → `list_transactions` (asks `movimient|movimentac|compras|transaccion`; shows a line with a date and an amount), and `balance` → `get_products` (asks `saldo|limite|cupo|disponible|debo|devo`; shows an amount).
    - CASE_STATUS: `status` → `get_cases`.
21. `src/tools/grounding.py`:
    - `required_kinds(route, customer_text, reply_text) -> list[GroundingKind]`, from the customer's words, else from what the reply shows.
    - `ungrounded(route, customer_text, reply_text, called_ok: set[str]) -> GroundingKind | None`: the first required kind whose tool isn't in `called_ok`, when the reply has account data (the `shows` regex).
22. `src/graph/nodes/respond.py`, `_respond_with_tools`:
    - Track `called_ok` (short names of the UC tools that returned without raising).
    - After the loop, run `ungrounded`. When it fires, apply the chosen option (A: one forced round with `tool_choice=<tool>`, then one normal round, then the check again; else `TOOL_DOWN`).
    - Return `{"guard": {...}}` in the state update.
23. `src/graph/state.py` gets `guard: dict | None`. `src/main.py` records it in `turn`, and `turn_custom_outputs(..., guard=None)` adds it. Logs have the kind and tool only, never the text.
24. Tests:
    - unit: `required_kinds` and `ungrounded` (movements without `list_transactions` fire; balance with `get_products` doesn't; a question without figures doesn't);
    - integration: a scripted LLM that answers movements after only `get_products` gets the forced retry, and with a good second answer `guard.action == "retried_ok"`; with a bad one, `TOOL_DOWN` and `safe_reply`;
    - e2e: `custom_outputs.guard` over `/invocations` is `null` on a grounded turn.
