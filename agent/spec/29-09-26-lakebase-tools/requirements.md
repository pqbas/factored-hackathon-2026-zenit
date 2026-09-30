# Requirements: the agent's bank data tools read from Lakebase

The agent's tools (`get_products`, `list_transactions`, `get_cases`) run today as UC functions behind the managed MCP server. They execute on serverless compute through Databricks Connect, which cost about USD 10/h with continuous use (USD 110 so far, USD 52 in one afternoon of local runs). The user decided that bank data reads move to Lakebase:
- the gold tables are copied as synced tables into a read-only schema `bank_ro` (w1:p1's part);
- the agent reads them with fixed SQL (this phase).

The Lakebase instance is already paid for, at about USD 0.18/h. Here the tools change where they read from, not what they return.

## 1. Functional requirements

After this phase, the agent keeps doing what it does today:

1. The three tools keep their names, their arguments as the LLM sees them, and their rows: the same columns, filters, order and limits as `agent/uc/bank_uc_consultas.sql`.
   - `get_products`: the customer's active credit cards and savings accounts, with `available_credit = credit_limit - current_balance` for cards and NULL for savings.
   - `list_transactions`: the 10 most recent movements of those products, optionally one product by `product_last4`.
   - `get_cases`: the customer's 10 most recent cases.
2. `customer_id` still comes only from the session (`bind_customer`). Whatever the LLM sends for it is discarded.
3. The handoff check (`verify_case`), the collector, the grounding guard (when it merges) and `fail_tools` work on the same rows as today, through `tool_rows`.
4. The agent stays stateless: it only reads.

And it changes in these ways:

5. Each tool runs one fixed, parameterized SQL query against `bank_ro` in Lakebase. The LLM never writes SQL, and the only values bound are the session's `customer_id` and the `product_last4` the LLM passes.
6. The agent connects to Lakebase with its Databricks identity through an OAuth-token Postgres pool: the App's service principal in prod, and the developer locally. The Postgres role has only `USAGE` on `bank_ro` and `SELECT` on its three tables.
7. A failing or slow query raises like any tool failure today, so the tool-down reply ("Ahora no puedo consultar esa información." once eval-fixes merges) and `fail_tools` keep working. The pool has a short connect timeout (5 s) and each query a short `statement_timeout` (5 s), so an unresponsive Lakebase fails fast instead of hanging the turn.
8. The managed MCP and UC function path is no longer used at runtime. It stays in the code behind `TOOLS_BACKEND=mcp` as a rollback, while `lakebase` is the default. The UC functions stay in UC, documented as the governed definition the SQL mirrors.

## 2. Decisions

- The tools return the same shape as the MCP ones (a JSON text with `columns` and `rows`), so `tool_rows` and everything downstream don't change.
- The SQL mirrors the UC functions line by line. A test compares them, so a change to one without the other fails.
- The connection pool is `databricks_ai_bridge.lakebase.AsyncLakebasePool` (already installed, used by databricks-langchain's checkpointer), which refreshes the OAuth token itself. One pool per process, opened on first use.
- Lakebase synced tables are snapshots, refreshed on demand (w1:p1's spec defines the freshness policy). The agent doesn't know or care when the data was refreshed.
- Keeping `TOOLS_BACKEND=mcp` costs nothing at runtime and lets us roll back without a deploy of new code. It is removed after the hackathon (future).
- Out of scope: writing to Lakebase, caching rows between turns, and the back's reads (w1:p1).

## 3. Context

- `agent/uc/bank_uc_consultas.sql` (the queries to mirror);
- `src/tools/mcp_client.py` (`tools_for`), `src/tools/bind_customer.py`, `src/tools/handoff.py` (`tool_rows`);
- `src/graph/nodes/respond.py` (`_bound_tools`), `src/main.py`, `src/config.py`;
- `agent/databricks.yml`, `agent/app.yaml`;
- Confirmed with w1:p1:
  - the instance is `bank-assistant-chat-db` (CU_1, PG16) and the database `databricks_postgres`;
  - the Postgres schema `bank_ro` is separate from the chat's `ai_chatbot`;
  - `bank_ro.customer_products`, `bank_ro.customer_transactions` and `bank_ro.customer_cases` are synced 1:1 from `workspace.bank_gold` in snapshot mode, and exist in UC as `workspace.bank_ro.<table>`;
  - the primary keys are composite and start with `customer_id`: `(customer_id, product_id)`, `(customer_id, transaction_id)`, `(customer_id, complaint_id)`. Every query filters by `customer_id`, so the PK index serves them, and a hand-made index wouldn't survive a snapshot refresh;
  - the App's service principal gets only `USAGE` on `bank_ro` and `SELECT` on the three tables. Locally, pcubasm1 owns the instance and can't be limited to SELECT.
