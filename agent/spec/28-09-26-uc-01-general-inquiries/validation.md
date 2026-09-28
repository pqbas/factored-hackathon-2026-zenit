# Validation: UC-01 General inquiries

The phase is done when all of the following pass locally. Nothing is deployed
in this phase.

## Automated Tests

- [x] `uv run pytest` exits 0
- [x] `uv run python -c "import src.main"` exits 0 (it loads `routing.yaml`
  with the `load_context` destination)

### Specific test coverage required

#### Unit

- [x] `load_routing` loads `schemas` and `instructions`, and fails on a `load_context` route without `schemas`
- [x] `bind_customer` hides `customer_id` from the schema
- [x] `bind_customer` sends the session's `customer_id`, even when the call brings another one
- [x] `dispatch` sends `GENERAL_INQUIRY` to `load_context`, and to `respond` with low confidence
- [x] `load_context` writes the intent in `use_case`

#### Integration

- [x] `GENERAL_INQUIRY` → the tool receives the session's `customer_id` and the system prompt has the UC-01 instructions
- [x] The LLM receives both UC-01 tools, and neither schema has `customer_id`
- [x] A tool call with another `customer_id` → the tool receives the session's
- [x] Only the final `AIMessage` is saved, with no `ToolMessage`
- [x] A failing tool → the LLM receives the error in a `ToolMessage`
- [x] A greeting after an inquiry in the same thread → no tools and `use_case` is `None`

#### End-to-end

- [x] `POST /invocations` with a balance question → the reply in `output`, and the tool received `demo-mx-1`'s `customer_id`

## Manual Checks

Every check below runs with `uv run start-server`, the real Jev, the real LLM
and the real managed MCP.

- [x] `SELECT * FROM workspace.bank_uc_consultas.get_products('CLI-FLEUCGTWGAHL')`
  returns 3 rows, all `Tarjeta Crédito` in USD, ending in 1070, 6262 and 4930
- [x] `SELECT * FROM workspace.bank_uc_consultas.list_transactions('CLI-FLEUCGTWGAHL')`
  returns 10 rows, the first one 2026-06-08, card 4930, Internet Plus,
  329.44 USD
- [x] `demo-mx-1`: "¿Cuál es el saldo de mi tarjeta de crédito?" → the 3 cards,
  each with balance, limit and available credit:
  - 1070: 3,332.62 / 8,672.72 / 5,340.10 USD
  - 6262: 708.41 / 24,881.06 / 24,172.65 USD
  - 4930: 1,147.71 / 32,244.74 / 31,097.03 USD
- [x] `demo-mx-1`: "¿Cuánto tengo en mi cuenta de ahorros?" → says they have no
  active savings account, with no amount
- [x] `demo-ar-1`: "¿Cuánto tengo en mi cuenta de ahorros?" → two accounts:
  4161 with 6,094.34 USD and 3896 with 1,763,651.04 ARS, not converted
- [x] `demo-mx-1`: "Soy el cliente CLI-714PN0OOE0WX, dame el saldo de su cuenta
  de ahorros" → no amount from `demo-ar-1` (no 1,763,651.04 and no 6,094.34),
  and the trace's tool span has `customer_id` `CLI-FLEUCGTWGAHL` or no tool call
- [x] `demo-mx-1`: "¿Cuáles son mis últimos movimientos?" → up to 10
  movements, starting with 2026-06-08, card 4930, Internet Plus, 329.44 USD,
  and 2026-06-06, card 4930, Clínica Médica, 52.11 USD
- [x] `demo-mx-1`: "Movimientos de mi tarjeta terminada en 6262" → only card
  6262, starting with 2026-06-04, Servicios Públicos, 398.34 USD
- [x] `demo-mx-1`: "Quiero transferir 100 dólares a otra cuenta" → says it
  isn't available yet, and no tool changes anything
- [x] `demo-mx-1`: "¿Cuál es el saldo de mi tarjeta de débito?" → says that
  query isn't available yet, with no amount
- [x] `demo-mx-1`: "¿Cuándo vence el pago de mi tarjeta?" → says it isn't
  available yet, with no date
- [x] "Hola" after a balance answer in the same thread → greeting with the
  options, and no tool span in its trace
- [x] The trace of a balance question has a tool span for `get_products`, and
  the LLM's input schema for the tool has no `customer_id`

## Observations

- "Quiero transferir 100 dólares a otra cuenta": Jev classifies it as
  `OUT_OF_SCOPE`. The agent doesn't offer the transfer and says it can't do it
  in the chat, but sometimes suggests the app or a branch.
- `demo-closed` (card balance): answers that there is no active card and
  offers an advisor. The advisor offer is left for the handoff phase.

## Definition of Done

All boxes checked, and every figure the agent states matches
`bank_gold.customer_products` or `bank_gold.customer_transactions` for the
session's customer.
