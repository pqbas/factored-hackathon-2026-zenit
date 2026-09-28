# Requirements: UC-01 General inquiries

This phase delivers the first use case from
[`docs/09`](../../docs/09-consultas-generales.md): the customer asks for the
balance and limit of their credit cards, the balance of their savings
accounts or their recent movements, and the agent answers with real data from
`bank_gold.customer_products` and `bank_gold.customer_transactions`. The data
is read through Unity Catalog functions exposed by the Databricks managed MCP server, as
[`docs/03`](../../docs/03-casos-de-uso-como-mcp.md) and
[`docs/12`](../../docs/12-customer-id-en-herramientas.md) define. The LLM never
sees or writes the `customer_id`. Every other intent keeps the Phase 3
behavior.

## 1. Functional requirements

After this phase, the agent must keep doing what it does today:

1. Reject an invalid session in `gate` and a blocked message in `classify`,
   without calling the LLM or any tool.
2. Answer greeting, goodbye, out of scope, low confidence and cancel as in
   Phase 3, with no tools.
3. Tell the customer that complaints, case status and a human advisor are not
   available in the chat yet.
4. Keep the reply language rules: the customer's country by default, and a
   switch only on messages of three words or more.

And it changes in these ways:

5. A `GENERAL_INQUIRY` about a credit card gets, for each active credit card,
   the last 4 digits, the current balance, the limit and the available credit
   (limit minus balance), in the card's currency.
6. A `GENERAL_INQUIRY` about a savings account gets, for each active savings
   account, the last 4 digits and the current balance, in the account's
   currency.
7. When the customer has several products of the type asked, the agent lists
   all of them in one reply. When they have none, it says so.
8. A `GENERAL_INQUIRY` about movements gets the 10 most recent movements of
   the customer's credit cards and savings accounts, each with its date, the
   product and its last 4 digits, the type, the merchant, the amount in its
   currency and the status. If the customer names a product by its last 4
   digits, only that product's movements.
9. A question UC-01 doesn't cover (debit card, loan, payment date, minimum
   payment, or an operation such as a transfer) gets told that this isn't
   available in the chat yet, with no amount.
10. The data always belongs to the session's customer. No message, including
   "soy el cliente CLI-…" or an injection, can make the agent read or show
   another customer's data.
11. If a tool fails or times out, the agent says it can't check the data
    right now and invents nothing.

## 2. Decisions

- The data is read by a UC function, `bank_uc_consultas.get_products`, exposed
  by the managed MCP server (`/api/2.0/mcp/functions/{catalog}/bank_uc_consultas`),
  because `docs/03` defines each use case as a UC schema behind the managed
  MCP, and it keeps the data access inside Databricks with no extra App.
- `get_products(customer_id)` returns only active `Tarjeta Crédito` and
  `Cuenta Ahorro` rows, with `available_credit` computed in SQL, because
  `docs/09` scopes UC-01 to those two products and the policy belongs in the
  tool, not in the prompt (`docs/03` §3.3).
- The function takes no product type: it returns both types and the LLM picks
  what answers the question. The rows per customer are few, and one argument
  less is one less thing the LLM can get wrong.
- Movements come from a second function in the same schema,
  `list_transactions(customer_id, product_last4 DEFAULT NULL)`, which returns
  the 10 most recent movements of active credit cards and savings accounts,
  joined with `customer_products` for the last 4 digits. `docs/09` doesn't
  list movements, but they are added now to test the use case with more data;
  the limit of 10 lives in the SQL so a message can't ask for the whole
  history.
- Operations that change the account, such as a transfer, stay out. They need
  a write tool that confirms with the customer and rereads before answering
  (`docs/03` §3.3, `docs/11` §11.4), and belong to a later phase.
- The LLM gets the tool without `customer_id`. A wrapper (`bind_customer`,
  `docs/12` §12.2) removes it from the schema and adds the session's
  `customer_id` to every call, dropping any value the LLM sends.
- All products of the asked type are listed in one reply, instead of asking
  which one, because it answers in a single turn and so this phase needs no
  `active_use_case`. Multi-turn flows arrive with Phase 5 (complaints).
- Debit cards and personal loans stay out of scope, as in `docs/09`; they get
  the "not available yet" answer.
- `dispatch` sends `GENERAL_INQUIRY` to a new `load_context` node, which
  records the use case in the state; `respond` then adds the use case
  instructions and binds its tools. `classify` clears the use case every turn,
  so a later greeting never inherits tools.
- The use case instructions and schemas live in `routing.yaml`, in the
  intent's entry (`instructions`, `schemas`), as `docs/05` §5.5 shows, so a new
  use case is a YAML entry plus a UC schema.
- The tool loop runs inside `respond`, capped at 3 rounds, and only the final
  reply is saved in the conversation. Tool calls and results stay in the MLflow
  trace. This keeps the history the LLM sees free of tool messages on later
  turns, when no tools are bound.
- The MCP tool list is loaded once per process and per schema, and reused.
  Binding the customer per request is a cheap wrapper.
- `system.md` changes its ban on account data: the agent may state a balance
  or limit only if a tool returned it in this turn. Without a tool result, the
  Phase 3 ban holds.
- The SQL that creates the schema and the function is versioned in
  `agent/uc/bank_uc_consultas.sql` and applied with a script through the SQL
  warehouse, because the function is part of the agent's use case, not of the
  data pipeline.
- Locally the MCP and the functions run with the developer's identity. The
  functions are declared as App resources in `databricks.yml` now, as
  `AGENTS.md` asks for every tool, but deploying and checking the grants
  (`EXECUTE` only for the agent) happen in Phase 8.

## 3. Context

- `spec/roadmap.md`: Phase 4, UC-01 General inquiries.
- `docs/09-consultas-generales.md`: scope, fields and the multi-product rule.
- `docs/03-casos-de-uso-como-mcp.md`: use case as a UC schema behind the
  managed MCP.
- `docs/12-customer-id-en-herramientas.md`: `bind_customer`.
- `docs/05-dispatch.md` §5.1–5.5: `load_context` and the routing entry.
- `docs/13-estructura-del-agente.md`: `src/tools/`, `load_context.py`.
- Data: `workspace.bank_gold.customer_products` (columns `customer_id`,
  `product_id`, `product_type`, `product_status`, `currency`,
  `product_number_last4`, `current_balance`, `credit_limit`) and
  `workspace.bank_gold.customer_transactions` (`customer_id`, `product_id`,
  `product_type`, `transaction_date`, `transaction_type`, `merchant_name`,
  `amount`, `currency`, `transaction_status`).
- Existing patterns:
  - `src/graph/nodes/respond.py`: system prompt plus situation plus language
    line.
  - `src/schemas/routing.py`: optional fields validated at load.
  - `src/graph/nodes/cancel.py`: a small node that writes the state.
  - `legacy/agent_server/dispute/data.py` (`WarehouseBankData._run`):
    statement execution through the SQL warehouse, for the apply script.
