# Requirements: Recolección y confirmación confiables

Stages 4 and 5 of [`docs/flujo-atencion.md`](../../../docs/flujo-atencion.md) already work for 3.C (complaint), 3.D1 (cancellation) and 3.D2 (case status). With `CLASSIFIER=llm`, which the App uses, they fail about 1 time in 4. This phase makes them deterministic where the flow allows it. The `custom_outputs.handoff` contract, the fixed texts of the document and the menu don't change.

Diagnosis, with the local agent and `CLASSIFIER=llm`, 4 runs of each scenario (simulator scenarios 06 and 10):

- 06 (3.D2, w1:p1's messages): 3 of 4 hand off.
  - In the failing run, "sí, confirmo" is classified CASE_STATUS by the confirmation rule, as it should be.
  - But the LLM rewrites the summary and the confirmation question instead of calling `hand_off_to_advisor`.
- 10 (3.C): 3 of 4 hand off.
  - In the failing run, the LLM ignores the customer's answers ("no lo reconozco", "no hice esa compra").
  - It repeats "¿Qué pasó? ¿No lo reconozco, me cobraron dos veces o el monto es distinto?" on every turn, until the confirmation.
- Common cause: in both flows the LLM decides by itself which field of the case is missing and when to hand off. The code only verifies the handoff once the LLM asks for it.

## 1. Functional requirements

After this phase, the agent must keep doing what it does today:

1. The menu, options A and B, and the flows of 3.C, 3.D1 and 3.D2 keep their questions, summaries and fixed texts from `docs/flujo-atencion.md`.
2. A handoff is verified against the bank's rows from that same turn and sends `{reason, summary, facts}`. The customer only sees "Te comunico con un asesor, que ya tiene los datos de tu caso.".
3. "cancelar" drops the collection without a handoff.

And it changes in these ways:

4. When the customer says yes to David's confirmation question, the turn always ends in the handoff attempt. The LLM is forced to call `hand_off_to_advisor` in its first round and fills the arguments from the summary in the history. The code then verifies them as today.
5. If that verification fails, David doesn't hand off and says which data point doesn't match, as today.
6. In 3.C and 3.D1, the fields the customer has already given are extracted each turn with one LLM call with structured output (the case's schema, all fields optional), reading the whole conversation.
7. Code picks the first missing field and asks its fixed question from the document. A field that is already there is never asked again.
   - For the card: the customer's cards, from `get_products`.
   - For the charge: the card's movements, from `list_transactions`.
   - For the type and the description: the question in the 3.C table.
   - For the product and the reason: the questions in the 3.D1 table.
8. When the case has every field and they match the bank's data, David shows a summary built by code and asks the exact question. A yes goes to requirement 4.
9. If a given field doesn't match (the card isn't the customer's, the charge doesn't show up), David says so and asks for it again, with the real options.
10. 3.D2 keeps the LLM to list complaints and give the status, because it has to explain free-form statuses and resolutions. Its confirmation gets requirement 4.
11. The replies are in the customer's language (es/pt), like the menu's fixed texts.

## 2. Decisions

- Force the tool on the confirmation turn (`tool_choice="hand_off_to_advisor"`) instead of trusting the LLM, because the Databricks Qwen endpoint accepts it: tested, it returns the call with the right arguments from the summary. It is the smallest change that closes failure (1).
- Extract the fields with structured output and let code choose the next question, instead of more prompt instructions. Three rounds of instructions for the same symptom didn't make it reliable. Code guarantees that a field that is already there is never asked again, which closes failure (2) no matter the model.
- The structured extraction reuses the case schemas in `src/tools/handoff.py` (`ComplaintCase`, `RetentionCase`) with optional fields, so there is one definition of each case.
- The extraction has a 4 s timeout like the classifier. If it fails, the turn falls back to today's path, where the LLM with the route's instructions collects the case, so a failure never leaves the customer without a reply.
- The fixed questions and the code-built summary live in `src/prompts/messages.py` in es and pt, like `MENU`, so they don't change from turn to turn.
- 3.D2 is left out of the extraction for this phase, because its main part (explaining the status) is free-form. Its known failure was the confirmation, which requirement 4 covers.
- Frustration, insistence and retention remain out of scope, as in section 7 of the document.

## 3. Context

- `docs/flujo-atencion.md`: 3.C, 3.D1 and 3.D2 (case tables), stage 4 (steps 1-6) and stage 5.
- `spec/29-09-26-case-status/`: the confirmation rule (`menu_rule_intent`) and `case_status`.
- Existing patterns:
  - `src/llm/llm_classifier.py` (structured output with a timeout).
  - `src/tools/handoff.py` (case schemas, `verify_case`, `tool_rows`).
  - `src/graph/nodes/respond.py` (`_respond_with_tools`, `_fetch_missing_rows`, `_hand_off`).
  - `src/llm/fallback.py` (`_confirmed_operation`).
  - `src/prompts/messages.py` (fixed es/pt texts).
