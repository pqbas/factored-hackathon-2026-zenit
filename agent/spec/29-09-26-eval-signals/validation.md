# Validation: turn signals for the evaluation runner

## Automated Tests

- [x] `uv run pytest -q` exits 0 with no failures

### Specific test coverage required

#### Unit

- [x] `prompt_version()` is 12 hex characters and the same on two calls
- [x] `turn_custom_outputs` carries `usage`, `model`, `prompt_version` and `classifier`
- [x] `resolve_session` reads `fail_tools`; without it, `fail_tools` is empty
- [x] `bind_customer(..., fail=True)` raises and never calls the tool
- [x] `configs/eval_sessions.json` has the 15 tokens; `demo-tool-down` has `fail_tools: ["get_products"]`

#### Integration

- [x] With `fail_tools=["get_products"]`, the tool isn't called and its error reaches the LLM as the tool result

#### End-to-end

- [x] `custom_outputs.usage` over `/invocations` is the sum of the usage of the turn's LLM calls
- [x] `model`, `prompt_version` and `classifier` come in every turn; a paused turn carries `usage: {0, 0}`

## Manual Checks

- [x] Local :8001 with `configs/eval_sessions.json` and `CLASSIFIER=llm`: a balance turn with `demo-mx-3` returns `usage` with non-zero `input_tokens` and `output_tokens`, `model`, `prompt_version` and `classifier: "llm"`
- [x] The same with `demo-tool-down`: the balance turn shows no figures, and the log shows no `get_products` call
- [ ] w1:p1 runs the cases 01, 11 and 40 with `npm run eval` against :8001 and gets tokens, cost, model and classifier

## Definition of Done

All boxes checked, w1:p1's OK on the signals, and merged with `/spec-ship`, in a PR separate from other work.
