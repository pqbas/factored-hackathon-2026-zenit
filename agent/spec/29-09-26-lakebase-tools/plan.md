# Plan: the agent's bank data tools read from Lakebase

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `src/tools/bank_sql.py` | new | The three fixed queries and the tool wrappers |
| `src/tools/lakebase.py` | new | The Lakebase pool (`AsyncLakebasePool`), opened on first use |
| `src/tools/tools_for.py` | new | `tools_for(schema)` picks Lakebase or MCP by `TOOLS_BACKEND` |
| `src/config.py` | existing | `tools_backend`, `lakebase_instance`, `lakebase_database`, `bank_ro_schema` |
| `src/main.py` | existing | Import `tools_for` from the new module |
| `databricks.yml`, `app.yaml` | existing | `database` resource for the agent App; env vars |
| `README.md` | existing | Running locally against Lakebase |

---

## Group 1: Queries and tools

1. `src/tools/bank_sql.py`:
   - `GET_PRODUCTS`, `LIST_TRANSACTIONS` and `GET_CASES` as SQL strings over `bank_ro.*`, with `%(customer_id)s` and `%(product_last4)s` placeholders, mirroring `uc/bank_uc_consultas.sql`: the `product_type IN ('Tarjeta Crédito', 'Cuenta Ahorro')` and `product_status = 'Active'` filters, the `CASE` for `available_credit`, `ORDER BY … DESC LIMIT 10`.
   - `bank_tools(pool) -> list[StructuredTool]`: the three tools with the same names and args schemas as the MCP ones (JSON schema dicts with `customer_id` and, for `list_transactions`, an optional `product_last4`), so `bind_customer` works unchanged.
   - Each tool runs its query and returns `json.dumps({"columns": [...], "rows": [...]}, default=str)`, the shape `tool_rows` parses. Decimals and timestamps become strings the way the MCP returns them: check one real MCP result against the new one and match it.
2. `src/tools/lakebase.py`: `get_pool()`, one `AsyncLakebasePool(instance_name=settings.lakebase_instance, database=settings.lakebase_database)` per process, opened on first use, with a small `max_size` (4), a 5 s connect timeout and a 5 s `statement_timeout` per query. A timeout raises from the tool.
3. `src/tools/tools_for.py`: `tools_for(schema)` returns `bank_tools(get_pool())` when `settings.tools_backend == "lakebase"`, else `mcp_client.tools_for(schema)`. `src/main.py` imports it from here.
4. `src/config.py`: `tools_backend` (`TOOLS_BACKEND`, default `lakebase`), `lakebase_instance` (`LAKEBASE_INSTANCE`), `lakebase_database` (`LAKEBASE_DATABASE`, default `databricks_postgres`), `bank_ro_schema` (`BANK_RO_SCHEMA`, default `bank_ro`).

---

## Group 2: App resources and docs

5. `databricks.yml`:
   - Add a `database` resource to the agent App (`instance_name: bank-assistant-chat-db`, `database_name: databricks_postgres`, `permission: CAN_CONNECT_AND_CREATE`).
   - Keep the UC function resources and comments, marking them as the rollback path.
6. `app.yaml`: `TOOLS_BACKEND=lakebase`, `LAKEBASE_INSTANCE`, `LAKEBASE_DATABASE`.
7. `README.md` and `agent/docs/` (one decision doc, linked from the README):
   - why Lakebase, with the measured numbers (MCP serverless about USD 10/h, warehouse USD 2.8/h, Lakebase USD 0.18/h);
   - the lineage `bank_gold.X → bank_ro.X` (synced, snapshot);
   - how to run locally.

---

## Group 3: Tests

8. `tests/unit/`:
   - each query has the customer filter, the product filters, the order and the limit;
   - the SQL mirrors `uc/bank_uc_consultas.sql` (same selected columns per tool);
   - `bank_tools` with a fake pool returns the `{"columns", "rows"}` JSON that `tool_rows` parses back to the same dicts;
   - `bind_customer` over a Lakebase tool overrides `customer_id`;
   - `tools_for` picks by `TOOLS_BACKEND`;
   - a pool that times out makes the tool raise, and the turn gets the tool-failure reply, not a hang.
9. `tests/integration/test_graph.py`: a balance turn and a complaint handoff with the Lakebase tools over a fake pool, same results as with the MCP fakes.
10. `tests/e2e/test_invocations.py`: one balance turn over `/invocations` with `TOOLS_BACKEND=lakebase` and a fake pool.
