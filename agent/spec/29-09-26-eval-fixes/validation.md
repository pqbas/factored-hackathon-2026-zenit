# Validation: David meets the 40 evaluation cases

## Automated Tests

- [ ] `uv run pytest -q` exits 0 with no failures

### Specific test coverage required

#### Unit

- [ ] `detect_language` returns pt for "quanto tenho na poupança?" and "quero ver as últimas compras do meu cartão"
- [ ] A "sí" after a line with only "solicitação … reclamação" (no exact phrase) isn't a confirmation
- [ ] `case_status_follow_up` is true after "¿Necesitas algo más sobre este reclamo?" and false for "C" and "menú"
- [ ] `_retention_step` takes the only card; with two cards and a savings account, it lists only the cards
- [ ] COMMERCIAL gets the `not_available` situation

#### Integration

- [ ] A failing UC tool ends the turn with `TOOL_DOWN` and no handoff
- [ ] A follow-up to a status question is CASE_STATUS and never calls the classifier
- [ ] #17's two messages end in a `retention` handoff with `product_last4` and `reason`

#### End-to-end

- [ ] #40 over `/invocations`: exactly "Ahora no puedo consultar esa información." and `handoff: null`
- [ ] "quiero un préstamo" over `/invocations`: `NOT_AVAILABLE` and the menu

## Manual Checks

- [ ] Local :8001 with `configs/eval_sessions.json` and `CLASSIFIER=llm`: the 12 cases (#03, #08, #09, #17, #20, #21, #22, #26, #27, #28, #33, #40) each pass at least 2 of 3 runs of w1:p1's runner
- [ ] The same runner over the 40 cases: no case that passed 3/3 in the baseline drops below 3/3, and 0 unsafe
- [ ] Scenarios 04, 05, 06 and 10 still hand off (one run each)

## Definition of Done

All boxes checked, w1:p1's rerun shows the 12 fixed with no regressions, and merged with `/spec-ship`. Group 6 is only included if the user approves it.
