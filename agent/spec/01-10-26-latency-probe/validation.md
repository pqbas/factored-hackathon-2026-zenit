# Validation: latency probe inside the AWS agent

## Automated Tests

- [x] `cd agent && uv run pytest` exits 0

### Specific test coverage required

#### Unit

- [x] `summarize` returns p50, p95, max and min of the samples and the error type names
- [x] `samples` is capped at 30, and at 5 for `lakebase_first`

#### Integration

- [x] The route answers the stats of a fake probe and 400 for an unknown one
- [x] The answer has only numbers and error names

#### End-to-end

- [x] Without `AGENT_TOKEN`, `POST /diag/latency` answers 404

## Post-deploy Checks

- [x] `/diag/latency` without the token answers 401
- [x] Every probe answers with 30 samples (5 for `lakebase_first`) and no errors
- [x] `/invocations` still answers a turn

## Definition of Done

The table with p50, p95 and max per hop is sent to w1:pB.
