# Dispute intake workflow ("cargo no reconocido")

Code: `agent_server/dispute/`. Tests: `tests/test_dispute.py` (`uv run --group dev pytest tests -q`).

## Who decides what

| Concern | Where | AI? |
|---|---|---|
| Identity | `session.py`: `custom_inputs.session_token` resolves to a customer_id. Chat text is never used. | No |
| Understanding | `nlu.py`: one LLM call returns intent, language, merchant, amount and date. The output is validated; the keyword baseline is the fallback and the evaluation baseline. | Yes |
| Next step | `graph.py`: deterministic state machine (START → COLLECT ↔ SELECT → CONFIRM → DONE / HANDOFF). | No |
| Data access | `data.py`: every query filters by the session customer_id. The SQL warehouse is used in Databricks; dummy CSVs locally. | No |
| Eligibility / escalation | `policy.py`: a synthetic, versioned rule set. Every decision records the rule ids that fired. | No |
| Wording | `i18n.py`: fixed Spanish and Portuguese templates. | No |
| Actions | A case is written to `bank_ops.dispute_cases` (idempotent MERGE), read back, and only then reported to the customer. | No |

## Required scenarios

- **Normal:** "No reconozco un cargo de Uber de ayer" → confirm → case `Open`.
- **Ambiguous:** several matching charges → numbered list. No details → the agent asks. No match twice → handoff.
- **Human:** high amount, fraud signal, inactive customer, 2 or more open cases, or an explicit request ("asesor" / "atendente") → case `Escalated` with a handoff packet. The packet contains the request, verified facts, actions taken, policy rules and unresolved questions.
- **Unsupported:** anything else → the agent explains its scope and offers a human.
- **Failures:**
  - No session or an expired session → no data is read.
  - Data tool errors → bounded retries, then an honest message or a handoff.
  - Write not verified → never reported as done.

## Run locally

`agent_app/.env` (gitignored) sets `DATABRICKS_WAREHOUSE_ID` to read real Unity Catalog tables. Remove it to use `data/dummy_output`. Without `LAKEBASE_INSTANCE_NAME`, conversation state lives in memory.

```bash
uv run start-server --port 8765
curl -s localhost:8765/invocations -H 'Content-Type: application/json' \
  -d '{"input":[{"role":"user","content":"No reconozco un cargo de Pemex"}],
       "custom_inputs":{"thread_id":"t1","session_token":"demo-mx-1"}}'
```

Demo tokens are defined in `session.py`: `demo-mx-1`, `demo-co-1`, `demo-ar-1`, `demo-closed`, `demo-expired`. Override them with `DEMO_SESSIONS_JSON`.

## Measured locally (dummy data, serverless warehouse, 2026-09-25)

LLM `databricks-qwen3-next-80b-a3b-instruct`: about 1 s per call. `qwen35-122b` took about 9 s because of its reasoning, with the same extraction results on our checks.

| Turn | Latency |
|---|---|
| First turn, cold | ~11 s |
| Selection / confirmation | ~2 s |
| Case creation (MERGE + read back) | ~6–7 s |
