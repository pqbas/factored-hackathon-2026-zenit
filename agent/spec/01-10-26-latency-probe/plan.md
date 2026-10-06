# Plan: latency probe inside the AWS agent

## Group 1: The probe

1. Create `agent/src/diag.py`:
   - `summarize(times, errors) -> dict` with n, p50, p95, max, min (seconds, 3 decimals) and the error type names;
   - one async function per probe, each timing a single sample with `time.perf_counter`;
   - `run_probe(name, samples, deps)` runs the samples sequentially; `lakebase_first` caps at 5, the rest at 30.

2. `agent/src/main.py`: when `settings.agent_token` is set, register `POST /diag/latency` on `app`, passing the agent's chat model, Jev client and routes. Unknown probe: 400.

## Group 2: Tests

3. `agent/tests/unit/test_diag.py`: `summarize` percentiles and error names; the sample caps.

4. `agent/tests/integration/test_diag_route.py`: with fake probes, the route answers the stats; an unknown probe is 400; the answer has only the expected keys.

5. `agent/tests/e2e/test_invocations.py`: without `AGENT_TOKEN` the route answers 404.

## Group 3: Measure

6. `scripts/aws/deploy.sh`, then call each probe with 30 samples (5 for `lakebase_first`) and report the table to w1:pB next to the local numbers.
