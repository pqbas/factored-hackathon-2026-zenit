# Plan: investment opportunities, the agent's flow

| Module | Origin | Change |
| --- | --- | --- |
| `src/tools/bank_sql.py` | existing | `get_investment_opportunity` tool over `bank_rules.investment_eligibility` |
| `src/tools/investment.py` | new | `eligibility_list(row)`, `suggestion_text(row, lang)`, `mentions_advice(text)` |
| `src/tools/handoff.py` | existing | `InvestmentCase`; `verify_case("investment")` |
| `configs/routing.yaml` | existing | INVESTMENT route (description, examples, instructions, `handoff_reason: investment`, grounding) |
| `src/prompts/messages.py` | existing | `INVESTMENT_SUGGESTION`, `INVESTMENT_DECLINED`, `NO_INVESTMENT_ADVICE`, confirmation phrase (es, pt) |
| `src/llm/fallback.py` | existing | Confirmation phrase for INVESTMENT; `answer_to_suggestion(text, previous_reply)` returns accepted, declined or None |
| `src/graph/nodes/classify.py` | existing | Suggestion answer rule; `investment_suggestion` in the state |
| `src/graph/nodes/respond.py` | existing | Suggestion after a GENERAL_INQUIRY answer; no-advice guard for INVESTMENT |
| `src/graph/state.py`, `src/main.py`, `src/schemas/turn_outputs.py` | existing | `investment_suggestion` in `custom_outputs` |

## Group 1: Tool and rules

1. `bank_sql.py`: `get_investment_opportunity(customer_id)`, a fixed SELECT of the view's columns with `WHERE customer_id = %(customer_id)s`. The schema is `bank_rules` (setting `BANK_RULES_SCHEMA`), validated as an identifier. It returns the same `{columns, rows}` JSON as the other tools.
2. `investment.py`:
   - `eligibility_list(row)`: codes built from the columns; `[{code: "direct_request"}]` when the row is missing or not eligible;
   - `suggestion_text(row, lang)`: the template with the balance formatted like the other replies;
   - `mentions_advice(text)`: a regex for returns and yields (rendimiento, rentabilidad, retorno, rendimento, %, acciones de, ações da), not tripped by the fixed texts.

## Group 2: Suggestion and answer

3. `respond.py`: after a GENERAL_INQUIRY reply that isn't `TOOL_DOWN` or the guard's safe reply, when no earlier David message has the disclaimer, call the tool.
   - If the customer is eligible and `product_id` is set, append `suggestion_text` and set `investment_suggestion: shown`.
   - If the tool fails, don't suggest.
4. `fallback.py`: `answer_to_suggestion`. The previous reply's last line must be the suggestion's question (es, pt). A yes gives `accepted`, a no (`no`, `no gracias`, `não`, `nao obrigado`) gives `declined`, and anything else gives None.
5. `classify.py`, after the menu rules:
   - `accepted`: INVESTMENT with `source="rules"`;
   - `declined`: the fixed `INVESTMENT_DECLINED` reply (a situation without a use case);
   - either way, `investment_suggestion` goes in the state.

## Group 3: Collection and handoff

6. `routing.yaml`, INVESTMENT route. Description and examples: "quiero invertir", "quero investir", "¿qué inversiones tienen?", and answers to the collection's questions. Its instructions:
   - collect interest, amount and currency, term and goal, one at a time, the interest limited to the product `get_investment_opportunity` returns or "no sé";
   - never recommend companies, stocks or returns;
   - end with the summary and the exact confirmation question;
   - on the yes, call `get_investment_opportunity` and then `hand_off_to_advisor`.

   Grounding kind `balance`, satisfied by `get_investment_opportunity` or `get_products`.
7. `fallback.py`, `_CONFIRMATIONS`: `(pasar tu|passar seu) interes` gives INVESTMENT.
8. `handoff.py`:
   - `InvestmentCase {product_id: str | None, amount: str, currency: str | None, term: str, goal: str}`;
   - `verify_case("investment")` needs the tool's rows: `product_id` must be null or the row's, and `investment_product` is the name in `language`;
   - `_REQUESTS["investment"] = "interés en un producto de inversión"`;
   - `_fetch_missing_rows` fetches `get_investment_opportunity` for `investment`.
9. `respond.py`, INVESTMENT replies: if `mentions_advice(reply)`, replace it with `NO_INVESTMENT_ADVICE` plus the pending question.

## Group 4: Signal and tests

10. State and `custom_outputs`: `investment_suggestion` (default null) in every branch.
11. Tests:
    - unit: `eligibility_list` (eligible, not eligible, missing row); `suggestion_text` in es and pt; `mentions_advice` on true and false cases, never tripped by the fixed texts; `answer_to_suggestion`; the confirmation phrase doesn't collide with CASE_STATUS's;
    - integration:
      - an eligible balance turn ends with one suggestion and `shown`;
      - a second balance turn in the same conversation gets no suggestion;
      - a not-eligible customer gets none;
      - a yes gives `accepted` and INVESTMENT, and a no gives `declined` with the fixed reply;
      - "quiero invertir" from a not-eligible customer collects, and the yes hands off with `eligibility [{direct_request}]`;
      - an LLM reply naming a return is replaced;
    - e2e: over `/invocations`, an eligible customer's balance, then "sí", the four answers and "sí, confirmo", end in the `investment` handoff with `verified_data`; the next turn is paused.
