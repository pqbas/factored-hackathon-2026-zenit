# Requirements: Estado de un reclamo (bloque c)

This block delivers option 3.D2 of [`docs/flujo-atencion.md`](../../../docs/flujo-atencion.md). The customer asks about a complaint and David answers with the real status from `bank_gold.customer_cases`. If the customer needs something more about it, David collects the case and hands it off with reason `case_status`. It also adds the rule that a yes to David's confirmation question keeps its operation, for 3.C, 3.D1 and 3.D2. The `custom_outputs` contract doesn't change: `handoff` keeps `{reason, summary, facts}`, and `facts.case_id` now carries the bank's `complaint_id`.

Most of the code already exists as WIP on `feat/pqbas-agent-case-status`: the UC function, the handoff check, the demo session, the instructions and the confirmation rule. This phase reviews it against the document, closes what is missing (the confirmation question in 3.D2 isn't reliable yet) and ships it.

## 1. Functional requirements

After this block, the agent must keep doing what it does today:

1. Options A and B (balances and movements), C (complaint) and D1 (cancellation) behave as in PRs #67, #70 and #74-#77.
2. A handoff sends `custom_outputs.handoff = {reason, summary, facts}`; the customer only sees "Te comunico con un asesor, que ya tiene los datos de tu caso." and never the summary.
3. "cancelar" drops the collection without a handoff.

And it changes in these ways:

4. `D` then `2`, or "¿cómo va mi reclamo?", calls `get_cases` for the session customer. If there is one complaint, David proposes it; if there are several, he lists them for the customer to pick.
5. David gives the status the bank knows. Open or In Process: "Tu reclamo está abierto y en revisión." Resolved or Closed: resolved on the resolution date, with the resolution and the compensation if there is one. Rejected: rejected. He never makes up a timeline, an answer or a resolution.
6. If the customer only wanted the status, David offers the menu (etapa 6).
7. If the customer needs something more about the complaint (a timeline, an answer, a review), David doesn't answer it. He shows a summary (complaint with date and reason, plus what the customer needs) and asks exactly "¿Confirmas estos datos para pasar tu consulta a un asesor?".
8. With a yes, the agent verifies the complaint against `get_cases` rows from that same turn, fetching them itself if the LLM didn't. It hands off with reason `case_status`, `facts.case_id` = the `complaint_id`, and `verified_data` with the bank's date, subcategory, amount, status and resolution, plus what the customer needs.
9. If the customer has no complaints, or talks about one that isn't in `get_cases`, David identifies it by the card and the charge, verified with `get_products` and `list_transactions`, and hands off the same way without a `case_id`.
10. A yes ("sí", "sí, confirmo", "correcto", "sim") to a question that offers to pass the complaint, the request or the query to an advisor keeps that operation (COMPLAINT, RETENTION or CASE_STATUS). This is a deterministic rule before the classifier, with Jev and with the LLM.
11. A reason or description given for a cancellation stays RETENTION even if it mentions fees or charges (classifier context instruction).
12. The demo session `demo-mx-2` (Eduardo, México) exists, with three real complaints: one open, one in process and one resolved.

## 2. Decisions

- Status comes from a new UC function `get_cases` in `bank_uc_consultas`, with the same pattern as `get_products`. It is filtered by the session's `customer_id` through `bind_customer`, returns the 10 most recent, and exposes no agent or internal ids other than `complaint_id`. The MCP server of the schema already exposes it without code changes.
- EXECUTE for the App's service principal goes on the schema, not per function, because `CREATE OR REPLACE FUNCTION` drops function-level grants. That took the App's tools down for 45 minutes (PR #77).
- The confirmation rule reads the last line of David's previous reply: a question that mentions an advisor ("asesor", "atendente") plus "tu/esta consulta", "tu/esta solicitud" or "tu/este reclamo". It doesn't require the exact wording, because the LLM sometimes paraphrases the question and the classifiers then read the "sí" as HUMAN_AGENT or COMPLAINT.
- `demo-mx-2` is a new demo session, because none of the three existing demo customers has complaints in `customer_cases`. The back mirrors demo sessions in `DEMO_CUSTOMERS_JSON`, so w1:p1 has to add it to the customer selector.
- The back won't yet pass a derived conversation that isn't in `customer_cases` (doc 3.D2, step 1), because the back doesn't expose it to the agent today. It is noted as future work, and David identifies the complaint by its charge instead.
- Simulator scenario 06 now goes through the whole flow with `demo-mx-2`, because the current one (demo-ar-1, "no tengo el número de caso") only exercised the old "not available" reply.

## 3. Context

- `docs/flujo-atencion.md`: 3.D2, etapa 4 (collection), etapa 5 (handoff) and §3 rule 5.
- `spec/roadmap.md`: Phase 6 (complaints) and Phase 7 (handoff), reshaped by the flow document into blocks (a), (b) and (c).
- Existing patterns:
  - `uc/bank_uc_consultas.sql` (`get_products`, `list_transactions`).
  - `scripts/grant_app.sql` and `scripts/apply_uc.py`.
  - `src/tools/handoff.py` (`verify_case`, `_verified_charge`).
  - `src/graph/nodes/respond.py` (`_fetch_missing_rows`, `_hand_off`).
  - `src/llm/fallback.py` (`menu_rule_intent`).
  - `configs/routing.yaml` (COMPLAINT and RETENTION routes with `handoff_reason`).
