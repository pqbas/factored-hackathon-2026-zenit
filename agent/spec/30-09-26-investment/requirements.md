# Requirements: investment opportunities, the agent's flow (block 2)

This is block 2 of the phase `spec/30-09-26-oportunidades-inversion` (general spec, approved by the user). David suggests, once per conversation, an investment product from a synthetic catalog, and only when fixed rules say the customer is eligible. If the customer accepts, David collects their interest and hands them off to an investment advisor. He never advises, never names companies, stocks or returns, and never executes anything.

The contract was agreed with w1:p1 (back, blocks 1 and 3) and w1:p6 (front, block 4):
- The view `bank_rules.investment_eligibility` holds one row per customer: `customer_id`, `eligible`, `savings_balance`, `savings_currency`, `savings_last4`, `threshold`, `has_investment_product`, `segment`, `country`, `campaign_id`, `product_id`, `product_name_es`, `product_name_pt`, `product_summary_es`, `product_summary_pt`. The `product_*` columns and `campaign_id` are null when there is no campaign.
- The handoff has `reason` `investment` and `use_case` `INVESTMENT`. Its `facts.verified_data` holds `product_id` (null for "no sé"), `investment_product` (the name in the conversation's language), `campaign_id`, `amount`, `currency`, `term`, `goal` and `eligibility`.
- `eligibility` is a list of `{code, ...data}` built by the agent from the row:
  - `savings_above_threshold` with `balance`, `currency` and `threshold`;
  - `no_investment_product`;
  - `campaign_match` with `segment` and `country`;
  - or `[{code: "direct_request"}]` when a customer who isn't eligible asked.
- Every turn carries `custom_outputs.investment_suggestion`: `shown`, `accepted`, `declined` or null.

## 1. Functional requirements

After this phase, the agent keeps doing what it does today:

1. Queries, complaints, cancellations and complaint status are unchanged, and so is the pause after a handoff.
2. David never moves money or confirms an operation.

And it changes in these ways:

3. Eligibility comes from the view through a read-only tool, `get_investment_opportunity`, with fixed SQL filtered by the session's `customer_id`. Neither the LLM nor the agent decides eligibility.
4. The suggestion comes once per conversation, at stage 6.
   - When a GENERAL_INQUIRY turn has answered (not tool-down, not the guard's safe reply) and the conversation has no suggestion yet, the agent reads eligibility.
   - If the customer is eligible and has a product, the agent appends a fixed-template suggestion in the conversation's language:
     - the verified reason, e.g. "Tienes 12.500,00 USD en tu cuenta de ahorro terminada en 1234.", with the figures from the view;
     - the product's name and summary from the catalog;
     - "Esto es información general, no asesoría.";
     - the question "¿Te gustaría que un asesor de inversiones te cuente más?".
   - That turn has `investment_suggestion: shown`.
5. The customer's answer to the suggestion is recognized from David's previous reply, by its fixed question.
   - A yes starts the collection (`accepted`).
   - A no gets a fixed "Entendido, no hay problema. ¿Te ayudo con algo más?" (`declined`).
   - Any other message is classified normally.
   - The suggestion never comes back in that conversation.
6. A direct request ("quiero invertir", "quero investir") is classified INVESTMENT and enters the same collection, eligible or not.
7. The collection (INVESTMENT route, LLM with instructions, like the other routes) asks for:
   - interest: the catalog product offered, or "no sé";
   - approximate amount and currency;
   - term;
   - goal.

   It closes with a short summary and the exact question "¿Confirmas estos datos para pasar tu interés de inversión a un asesor?" (pt "Você confirma estes dados para passar seu interesse de investimento a um atendente?"). The customer's yes forces the handoff tool, as in the other flows.
8. The handoff check: `product_id` must be null or the product of the customer's row. `campaign_id`, `investment_product` and `eligibility` come from the row, never from the LLM. `amount`, `currency`, `term` and `goal` are taken as the customer said them. Then David answers the fixed handoff reply and goes silent.
9. The no-advice guard: an INVESTMENT reply that mentions returns, percentages, stocks or company names is replaced by a fixed text, "No puedo recomendar empresas, acciones ni rendimientos; eso lo ve un asesor de inversiones." followed by the pending question. "¿En qué empresa invierto?" gets that text too.
10. The grounding guard covers the amounts in INVESTMENT replies: a balance figure needs `get_investment_opportunity` or `get_products` in the turn.
11. Everything works in es and pt, following the language rules (clear message > selector > history/country).

## 2. Decisions

- The suggestion is a fixed template filled from the view, not LLM text. It is an offer with regulatory weight, so the wording and the disclaimer never vary, and its figures are grounded by construction. This is in line with the other fixed texts the flow mandates.
- The collection stays with the LLM, like the complaint and cancellation fallback path. The user asked for guards over new code-built flows, so the no-advice guard and the forced handoff check its result.
- "Once per conversation" is read from the history: a David message that has the fixed disclaimer. The agent stays stateless, and since #90 the back sends only the current conversation.
- The confirmation phrase is new ("pasar tu interés de inversión") so the confirmation rule never confuses it with a complaint status ("pasar tu consulta").
- Out of scope: risk profile, returns, executing orders, and suggesting in flows other than GENERAL_INQUIRY. These are future work.

## 3. Context

- General spec: `spec/30-09-26-oportunidades-inversion/` (requirements, plan block 2, validation).
- Code:
  - `configs/routing.yaml`;
  - `src/tools/bank_sql.py`, `src/tools/handoff.py` (cases, `verify_case`), `src/tools/grounding.py`;
  - `src/graph/nodes/respond.py`, `src/graph/nodes/classify.py`, `src/llm/fallback.py` (`_CONFIRMATIONS`);
  - `src/prompts/messages.py`, `src/schemas/turn_outputs.py`, `src/main.py`.
