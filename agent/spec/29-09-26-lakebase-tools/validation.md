# Validation: the agent's bank data tools read from Lakebase

## Automated Tests

- [x] `uv run pytest -q` exits 0 with no failures

### Specific test coverage required

#### Unit

- [x] Each query filters by the bound `customer_id`, active cards and savings, and has the UC function's order and limit
- [x] The selected columns per tool match `uc/bank_uc_consultas.sql`
- [x] A Lakebase tool's result parses with `tool_rows` into the expected dicts
- [x] `bind_customer` discards the LLM's `customer_id` on a Lakebase tool
- [x] `tools_for` returns the Lakebase tools by default and the MCP ones with `TOOLS_BACKEND=mcp`

- [x] An unresponsive Lakebase (timeout) makes the tool raise within the timeout

#### Integration
- [x] A Lakebase timeout during a turn ends in the tool-failure reply, with no handoff and no figures

- [x] A balance turn and a verified complaint handoff work with the Lakebase tools over a fake pool

#### End-to-end

- [x] A balance turn over `/invocations` with `TOOLS_BACKEND=lakebase` answers from the fake pool's rows

## Manual Checks

- [x] Once w1:p1's `bank_ro` exists: for demo-mx-1, demo-mx-2 and demo-co-3, the rows of each tool from Lakebase equal the UC function's rows from one last warehouse query (a single, minimal comparison run)
- [x] Local :8001 with `TOOLS_BACKEND=lakebase`: scenarios 04, 05, 06 and 10 still hand off, and a balance question answers with the right figures
- [ ] Billing, the day after: no new INTERACTIVE / DATABRICKS_CONNECT serverless usage from the agent
- [ ] w1:p1 runs the "after" evaluation (40×3) against :8001 on Lakebase

## Definition of Done

All boxes checked, merged with `/spec-ship` after w1:p1's `bank_ro` is live. The production deploy waits for w1:p4's request.
