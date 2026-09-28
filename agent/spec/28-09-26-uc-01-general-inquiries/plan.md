# Plan: UC-01 General inquiries

## Code changes

| Module                            | Origin                         | Change                                                                        |
| --------------------------------- | ------------------------------ | ----------------------------------------------------------------------------- |
| `uc/bank_uc_consultas.sql`        | `docs/09`                      | New; schema, `get_products` and `list_transactions`.                          |
| `scripts/apply_uc.py`             | `legacy/.../dispute/data.py`   | New; runs a `uc/*.sql` file through the SQL warehouse.                        |
| `configs/routing.yaml`            | `docs/05` §5.5                 | `GENERAL_INQUIRY` goes to `load_context`, with `schemas` and `instructions`.  |
| `src/schemas/routing.py`          | —                              | Adds `schemas` and `instructions` to `IntentRoute`.                           |
| `src/config.py`                   | —                              | Adds `uc_catalog` (`UC_CATALOG`, default `workspace`).                        |
| `src/tools/mcp_client.py`         | `docs/03`                      | New; loads and caches the tools of a UC schema from the managed MCP.          |
| `src/tools/bind_customer.py`      | `docs/12` §12.2                | New; hides `customer_id` from the LLM and injects the session's.              |
| `src/graph/state.py`              | —                              | Adds `use_case: str \| None`.                                                 |
| `src/graph/nodes/load_context.py` | `docs/05` §5.2 step 5          | New; writes `use_case`.                                                       |
| `src/graph/nodes/classify.py`     | —                              | Clears `use_case` every turn.                                                 |
| `src/graph/nodes/respond.py`      | —                              | With a use case: instructions, bound tools and a tool loop.                   |
| `src/graph/build.py`              | —                              | Adds the `load_context` node and passes the tool loader to `respond`.         |
| `src/prompts/system.md`           | —                              | Account data only from a tool result in this turn.                            |
| `src/main.py`                     | —                              | Passes the MCP tool loader to `build_graph`.                                  |
| `pyproject.toml`                  | `docs/11` §11.2                | Declares `databricks-mcp` and `langchain-mcp-adapters`.                       |

---

## Group 1: UC function

1. Create `uc/bank_uc_consultas.sql`, with `${catalog}` as the only
   placeholder:
   - `CREATE SCHEMA IF NOT EXISTS ${catalog}.bank_uc_consultas`
   - `CREATE OR REPLACE FUNCTION ${catalog}.bank_uc_consultas.get_products(customer_id STRING COMMENT '...')`
     `RETURNS TABLE (product_type STRING, product_number_last4 STRING, currency STRING, current_balance DECIMAL(18,2), credit_limit DECIMAL(18,2), available_credit DECIMAL(18,2))`
     with a `COMMENT` that says what it returns, for the LLM.
   - The body reads `${catalog}.bank_gold.customer_products` where
     `customer_id = get_products.customer_id`,
     `product_type IN ('Tarjeta Crédito', 'Cuenta Ahorro')` and
     `product_status = 'Active'`. `available_credit` is
     `credit_limit - current_balance` for credit cards and `NULL` otherwise.
   - `CREATE OR REPLACE FUNCTION ${catalog}.bank_uc_consultas.list_transactions(customer_id STRING COMMENT '...', product_last4 STRING DEFAULT NULL COMMENT '...')`
     `RETURNS TABLE (transaction_date TIMESTAMP, product_type STRING, product_number_last4 STRING, transaction_type STRING, merchant_name STRING, amount DECIMAL(18,2), currency STRING, transaction_status STRING)`
     with a `COMMENT` for the LLM.
   - The body joins `${catalog}.bank_gold.customer_transactions` with
     `customer_products` on `product_id` and `customer_id`, filters
     `customer_id = list_transactions.customer_id`, the same two product types
     and `product_status = 'Active'`, and
     `product_last4` when it isn't `NULL`; orders by `transaction_date DESC`
     and keeps 10 rows.

2. Create `scripts/apply_uc.py`: `uv run python scripts/apply_uc.py uc/bank_uc_consultas.sql`
   - Reads the file, replaces `${catalog}` with `settings.uc_catalog`, splits
     on `;` and runs each statement with `WorkspaceClient().statement_execution`
     on `DATABRICKS_WAREHOUSE_ID`, waiting for each one, like
     `WarehouseBankData._run`.
   - Fails with the statement's error message if one fails.

3. Apply it to the workspace and check
   `SELECT * FROM workspace.bank_uc_consultas.get_products('CLI-FLEUCGTWGAHL')`
   returns the 3 credit cards of `demo-mx-1` and nothing else, and that
   `list_transactions('CLI-FLEUCGTWGAHL')` returns 10 rows starting with the
   2026-06-08 movement at Internet Plus.

---

## Group 2: Routing and config

4. In `src/schemas/routing.py`, `IntentRoute` gets
   `schemas: list[str] = []` and `instructions: str | None = None`. A route
   whose `destination` is `load_context` needs both; `load_routing` fails
   otherwise.

5. In `configs/routing.yaml`, `GENERAL_INQUIRY` changes to:
   - `destination: load_context`
   - `schemas: [bank_uc_consultas]`
   - `option` becomes "Consultar el saldo, el límite o los movimientos de tu
     tarjeta o cuenta" / "Consultar o saldo, o limite ou as movimentações do
     seu cartão ou conta".
   - `instructions` in Spanish:
     - Use `get_products` for balances and limits and `list_transactions` for
       movements; never state a figure a tool didn't return.
     - Credit card: for each card, last 4 digits, balance, limit and
       available credit. Savings account: for each account, last 4 digits and
       balance.
     - Several products of the type asked: list them all. None: say the
       customer has no such active product.
     - Amounts in the product's currency, as returned, never converted.
     - Movements: list date, product and last 4 digits, merchant, amount with
       its currency and status. If the customer names a card or account by its
       last 4 digits, pass them as `product_last4`.
     - Debit card, loan, payment date, minimum payment or an operation such
       as a transfer: that isn't available in the chat yet.
     - If the tool fails: say it can't check the data right now.

6. In `src/config.py`, add `uc_catalog` (`UC_CATALOG`, default `workspace`).

7. In `databricks.yml`, add the two functions to the App's `resources` as
   `uc_securable` entries with `EXECUTE`, as `AGENTS.md` asks for every tool.
   Deploying and checking the grants stays for Phase 8.

8. In `pyproject.toml`, declare `databricks-mcp` and `langchain-mcp-adapters`
   (already in `uv.lock` as transitive dependencies).

---

## Group 3: Tools

9. Create `src/tools/mcp_client.py`:
   - `async def tools_for(schema: str) -> list[BaseTool]`: builds the URL
     `{host}/api/2.0/mcp/functions/{settings.uc_catalog}/{schema}` with the
     host of `WorkspaceClient().config`, and loads its tools with
     `databricks_langchain.DatabricksMultiServerMCPClient` and
     `DatabricksMCPServer`.
   - Caches the result per schema in a module-level dict, so the tool list is
     fetched once per process.

10. Create `src/tools/bind_customer.py` with
   `bind_customer(tool: BaseTool, customer_id: str) -> BaseTool`, following
   `docs/12` §12.2:
   - The returned tool's `args_schema` is the original without
     `customer_id` (in `properties` and `required`).
   - On call, it drops any `customer_id` in the arguments and calls the
     original with the session's.

---

## Group 4: Graph

11. In `src/graph/state.py`, add `use_case: str | None`.

12. Create `src/graph/nodes/load_context.py` with `load_context(state)`: returns
    `{"use_case": state["classification"]["intent"]}`.

13. In `src/graph/nodes/classify.py`, add `"use_case": None` to the update it
    returns.

14. In `src/graph/nodes/respond.py`, the signature becomes
    `respond(state, llm, routes, intent_threshold, tools_for)`:
    - Without `use_case`: as today.
    - With `use_case`: the system prompt is `system.md`, the route's
      `instructions` and the language line (no situation, no options). The
      tools are `tools_for(schema)` for each of the route's `schemas`, each one
      wrapped with `bind_customer(tool, state["session"]["customer_id"])`.
    - The tool loop: `llm.bind_tools(tools)`, and while the reply has
      `tool_calls` and fewer than 3 rounds ran, run each call and append the
      reply and a `ToolMessage` per call. A tool that raises gets a
      `ToolMessage` with the error text, so the LLM answers with the failure
      instruction.
    - Returns only the final `AIMessage` in `messages`.

15. In `src/graph/build.py`:
    - Add `_LOAD_CONTEXT = "load_context"` to `GRAPH_NODES`, the node, the
      `load_context → respond` edge and the conditional-edge mapping.
    - `build_graph` takes a `tools_for` argument and passes it to `respond`.

16. In `src/prompts/system.md`, replace the Phase 3 paragraph: the assistant
    may state a balance, limit or available credit only if a tool returned it
    in this turn; otherwise it never states a balance, movement, limit, card
    status or case status, and never claims to have done something on the
    account.

17. In `src/main.py`, pass `mcp_client.tools_for` to `build_graph`.

18. Update the status sections of `docs/03` §3.5, `docs/05` §5.7, `docs/09`
    and `docs/12` §12.5: UC-01 runs on `bank_uc_consultas` with
    `bind_customer`; grants and deployment pending for Phase 8.

---

## Group 5: Tests

19. `tests/unit/`:
    - `test_routing.py`: `schemas` and `instructions` load; a `load_context`
      route without `schemas` fails.
    - `test_bind_customer.py`, with a fake `StructuredTool` that records its
      arguments:
      - `customer_id` is not in the wrapped tool's schema.
      - A call without `customer_id` sends the session's.
      - A call with `customer_id="CLI-OTHER"` sends the session's.
    - `test_dispatch.py`: `GENERAL_INQUIRY` with high confidence →
      `load_context`; with low confidence → `respond`.
    - `test_load_context.py`: writes the classification's intent in
      `use_case`.

20. `tests/integration/test_graph.py`, with fake `get_products` and
    `list_transactions` tools and a
    scripted fake LLM (first a tool call, then a text reply):
    - `GENERAL_INQUIRY` → the tool is called with the session's
      `customer_id`, and the system prompt has the UC-01 instructions.
    - The LLM receives both tools, and neither schema has `customer_id`.
    - The LLM sends `customer_id="CLI-OTHER"` in the tool call → the tool
      still receives the session's.
    - Only the final `AIMessage` is saved in the state; no `ToolMessage`.
    - A tool that raises → the LLM receives a `ToolMessage` with the error.
    - `GREETING` after a `GENERAL_INQUIRY` in the same thread → no tools and
      `use_case` is `None`.

21. `tests/e2e/test_invocations.py`: `POST /invocations` with "¿cuál es el
    saldo de mi tarjeta?" (Jev `GENERAL_INQUIRY`), with `tools_for` and the LLM
    faked → the fake reply is in `output`, and the tool received
    `demo-mx-1`'s `customer_id`.
