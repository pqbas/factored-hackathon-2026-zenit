# Validation: latency probe inside the AWS agent

## Automated Tests

- [ ] `cd agent && uv run pytest` exits 0

### Specific test coverage required

#### Unit

- [ ] `summarize` returns p50, p95, max and min of the samples and the error type names
- [ ] `samples` is capped at 30, and at 5 for `lakebase_first`

#### Integration

- [ ] The route answers the stats of a fake probe and 400 for an unknown one
- [ ] The answer has only numbers and error names

#### End-to-end

- [ ] Without `AGENT_TOKEN`, `POST /diag/latency` answers 404

## Post-deploy Checks

- [ ] `/diag/latency` without the token answers 401
- [ ] Every probe answers with 30 samples (5 for `lakebase_first`) and no errors
- [ ] `/invocations` still answers a turn

## Definition of Done

The table with p50, p95 and max per hop is sent to w1:pB.
