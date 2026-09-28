# Validation: Stateless agent

## Automated Tests

- [ ] `uv run pytest` exits 0
- [ ] `uv run python -c "import src.main"` exits 0 with no `LAKEBASE_INSTANCE_NAME`
- [ ] `grep -rn "checkpointer\|psycopg\|LAKEBASE" src app.yaml databricks.yml` finds nothing

### Specific test coverage required

#### Unit

- [ ] `mask_sensitive` masks every card number, CVV and password in a text
- [ ] `conversation_language` picks the last earlier message with three words or more, and the country without one

#### Integration

- [ ] The graph answers from the input history, with no checkpointer
- [ ] A card number in an earlier message reaches the LLM masked
- [ ] A short message after a long Portuguese one gets the Portuguese language line
- [ ] Two runs with the same `thread_id` share no messages

#### End-to-end

- [ ] `POST /invocations` with a 3-message history → the LLM receives the 3 messages
- [ ] `POST /invocations` with 30 messages → the LLM receives the last 20

## Manual Checks

With `uv run start-server` and the back on Postgres (`chatbot_dev`):

- [ ] demo-co-1: "¿cuál es el saldo de mi tarjeta?", then "¿y el límite?" in
  the same chat → the second answer uses the first turn's context
- [ ] Restart the agent between those two turns → the second turn still has
  the context (it comes from the back)
- [ ] "Mi tarjeta es 4111 1111 1111 1111" gets the sensitive-data reply; the
  next turn's LLM input in the MLflow trace shows `[NÚMERO OCULTO]`
- [ ] "Olá, gostaria de saber o saldo do meu cartão", then "e o limite?" → both
  answers in Portuguese

## Definition of Done

All boxes checked, and the agent runs with no database of its own.
