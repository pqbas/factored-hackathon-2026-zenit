# Validation: the agent on AWS App Runner

The phase is ready to merge when all of the following pass.

## Automated Tests

- [x] `cd agent && uv run pytest` exits 0
- [x] `docker build -f agent/Dockerfile agent` exits 0

### Specific test coverage required

#### Unit

- [x] `token_ok` is true only for the exact token; false for a wrong, empty or missing one

#### Integration

- [x] With the check on, `GET /health` answers 200 without the header
- [x] With the check on, another path answers 401 without the header and with a wrong one, and passes with the right one
- [x] The token never appears in the log

#### End-to-end

- [x] `POST /invocations` with `AGENT_TOKEN` set: 401 without `x-agent-token`, 200 with it
- [x] `POST /invocations` with `AGENT_TOKEN` unset: 200, as today

## Manual Checks

- [x] The image runs as a non-root user and `docker history` shows no secret
- [x] Local container with the principal's variables: `/health` 200 and one turn with `demo-mx-1` lists the customer's products
- [x] `aws resourcegroupstaggingapi get-resources --tag-filters Key=project,Values=bank-assistant` lists the agent's repository, role, secrets and service

## Post-deploy Checks

- [x] `https://<agent url>/health` answers 200
- [x] `/invocations` without the token answers 401; with it, a turn with `demo-mx-1` returns the products from Lakebase
- [x] The service's log shows `Classifier: jev (Jev configured: True)` and turns with `classify source=jev`
- [x] A `sim-` token that doesn't exist is rejected as invalid
- [x] The token and the principal's secret don't appear in the service's log
- [ ] The back on AWS, with `API_PROXY` on the agent's URL and the token, answers a chat turn (with w1:pC)
- [ ] The Databricks App still answers and its config didn't change
- [x] Latency per turn (p50, p95) and the share of turns classified by Jev are reported

## Rollback Criteria

If the AWS agent fails or is slower than the Databricks one, the back's `API_PROXY` goes back to the Databricks App's URL; nothing else depends on this service.

## Definition of Done

All boxes checked, the service running and reachable only with the token, and the latency numbers sent to w1:pB.
