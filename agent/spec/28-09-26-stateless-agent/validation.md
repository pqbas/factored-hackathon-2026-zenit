# Validation: Stateless agent

## Automated Tests

- [x] `uv run pytest` exits 0
- [x] `uv run python -c "import src.main"` exits 0 with no `LAKEBASE_INSTANCE_NAME`
- [x] `grep -rn "checkpointer\|psycopg\|LAKEBASE" src app.yaml databricks.yml` finds nothing

### Specific test coverage required

#### Unit

- [x] `mask_sensitive` masks every card number, CVV and password in a text
- [x] `conversation_language` picks the last earlier message with three words or more, and the country without one

#### Integration

- [x] The graph answers from the input history, with no checkpointer
- [x] A card number in an earlier message reaches the LLM masked
- [x] A short message after a long Portuguese one gets the Portuguese language line
- [x] Two runs with the same `thread_id` share no messages

#### End-to-end

- [x] `POST /invocations` with a 3-message history → the LLM receives the 3 messages
- [x] `POST /invocations` with 30 messages → the LLM receives the last 20

## Manual Checks

With `uv run start-server` and the back on Postgres (`chatbot_dev`):

- [x] demo-co-1: "¿cuál es el saldo de mi tarjeta?", then "¿y el límite?" in
  the same chat → the second answer uses the first turn's context
- [x] Restart the agent between those two turns → the second turn still has
  the context (it comes from the back)
- [x] "Mi tarjeta es 4111 1111 1111 1111" gets the sensitive-data reply; the
  next turn's LLM input in the MLflow trace shows `[NÚMERO OCULTO]`
- [x] "Olá, gostaria de saber o saldo do meu cartão", then "e o limite?" → both
  answers in Portuguese

## Observations

- The first manual run of the Portuguese check failed: "E limite?" got made-up
  limits because the LLM answered without a tool and the history only holds
  earlier replies. Fixed by requiring a tool call on the first round of a use
  case; the rerun passed.
- Debit card and payment date: 9 of 9 answers say it isn't available without
  sending the customer to another channel; 1 of 9 (pt) said the customer has
  no active debit card.

## Definition of Done

All boxes checked, and the agent runs with no database of its own.
