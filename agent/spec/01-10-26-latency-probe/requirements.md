# Requirements: latency probe inside the AWS agent

The user wants to know how much of a turn is the network between App Runner (us-west-2) and Databricks, and how much is each service. The service's log has no time per step (only the classify line), so the AWS agent gets a diagnostic endpoint that runs the measurements from inside the container and returns the numbers. It is temporary and can be removed after the measurement. No contract of `/invocations` changes and no AWS resource is created.

## 1. Functional requirements

After this phase, the agent keeps doing what it does today:

1. `/invocations` and `/health` behave the same.
2. Without `AGENT_TOKEN` (local dev, the Databricks App) the diagnostic route doesn't exist.

And it changes in these ways:

3. With `AGENT_TOKEN` set, `POST /diag/latency` (behind the same `x-agent-token`) takes `{"probe": <name>, "samples": <n>}` and answers `{"probe", "n", "p50", "p95", "max", "min", "errors", "times"}` in seconds. `samples` is capped at 30. An optional `pause` (seconds, at most 5) waits between samples without being timed, because 30 Qwen calls in a row hit the endpoint's rate limit.
4. Probes, one per request so none nears App Runner's request timeout:
   - `connect_workspace`, `connect_lakebase`: TCP connect to the workspace host (443) and the Lakebase host (5432); the pure network round trip.
   - `oauth_token`: a client-credentials token request for the service principal, not cached.
   - `qwen_min`: the agent's chat model with "di hola" and `max_tokens=5`.
   - `qwen_reply`: the same model writing a balance reply from fixed product rows, `max_tokens=200`.
   - `lakebase_query`: the fixed `GET_PRODUCTS` query for a demo customer, with the pool already open.
   - `lakebase_first`: a new pool, its token and the first query; at most 5 samples.
   - `jev`: one classification with the agent's `JevClient` and routes.
5. The answer never contains tokens, secrets, rows or texts: only numbers and error type names.

## 2. Decisions

- An endpoint and not the log, because the log has no time per step and adding timing lines to every node is a bigger change than one isolated route.
- Each probe uses the agent's own clients (`get_chat_model`, `get_pool`, `JevClient`), so the numbers are what a real turn pays.
- The route is registered only when the token is set, so it can't be open anywhere.
- Cost: 60 Qwen calls with tiny outputs, 30 Jev calls and 30 token requests; cents.
- Out of scope: per-node timings in every turn's log (future), and keeping the endpoint as a permanent feature.

## 3. Context

- `agent/src/inbound_auth.py`, `agent/src/main.py`, `agent/src/tools/lakebase.py`, `agent/src/tools/bank_sql.py`, `agent/src/llm/jev.py`, `agent/src/llm/chat.py`.
- `agent/scripts/aws/deploy.sh` to ship it.
