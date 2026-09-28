# Validation: Conversation without a use case

The phase is done when all of the following pass locally. Nothing is deployed
in this phase.

## Automated Tests

- [ ] `uv run pytest` exits 0
- [ ] `uv run python -c "import src.main"` exits 0 (it loads `routing.yaml`,
  with its options and the `cancel` destination)

### Specific test coverage required

#### Unit

- [ ] `load_routing` loads `option` and fails when an option lacks `pt`
- [ ] `render_options` lists the three options in order, in `es` and `pt`, and uses `es` for `other`
- [ ] `situation_for` returns `clarify` below the threshold, even for `GREETING`
- [ ] `situation_for` returns `greeting`, `goodbye` and `out_of_scope` for those intents, and `unavailable` for `GENERAL_INQUIRY` and `HUMAN_AGENT`
- [ ] `dispatch` sends `CANCEL` to `cancel` even with low confidence, and sends low confidence to `respond`
- [ ] `fallback_classify` gives confidence 1.0 on a keyword match and 0.0 otherwise
- [ ] `cancel` returns `CANCEL_REPLY` in `es` and `pt`

#### Integration

- [ ] Greeting → the system prompt has the greeting instruction and the three options
- [ ] `GENERAL_INQUIRY` → the system prompt has the `unavailable` instruction
- [ ] Low confidence → the system prompt has the `clarify` instruction
- [ ] Goodbye → the system prompt has no options block
- [ ] Cancel → `CANCEL_REPLY`, LLM not called
- [ ] Portuguese greeting → the options are in Portuguese

#### End-to-end

- [ ] `POST /invocations` with "cancelar" → `CANCEL_REPLY` in `output`
- [ ] `POST /invocations` with "hola" → LLM text in `output`, and the system prompt lists the options

## Manual Checks

Every check below runs with `uv run start-server`, the real Jev, the real LLM
and `session_token=demo-mx-1`.

- [ ] "Hola" → greeting that lists the three options
- [ ] "Olá" → greeting in Portuguese with the options in Portuguese
- [ ] "¿Cuál es mi saldo?" → says the option isn't available yet, with no
  amount, and offers the options
- [ ] "Quiero hablar con un asesor" → says it isn't available yet, and
  doesn't promise a handoff
- [ ] "¿Qué clima hace hoy?" → says it can't help with that and lists the
  options
- [ ] "Cancelar" → the fixed confirmation. The trace has no CHAT_MODEL span.
- [ ] "Gracias, eso es todo" → farewell without the options list
- [ ] An ambiguous message ("lo de antes") → asks to clarify, with the
  options. The trace has `classify.intent_confidence` below 0.5.
- [ ] Add a fourth `option` to an intent in `routing.yaml` and restart → "Hola"
  lists it, with no code change

## Definition of Done

All boxes checked, and no reply from the agent states an amount, a limit, a
card status or a case status.
