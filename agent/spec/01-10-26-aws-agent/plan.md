# Plan: the agent on AWS App Runner

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `agent/src/config.py` | existing | New setting `agent_token` (`AGENT_TOKEN`) |
| `agent/src/inbound_auth.py` | — | New: the token check |
| `agent/src/main.py` | existing | Registers the middleware on `app` |
| `agent/Dockerfile`, `agent/.dockerignore` | — | New: the image |
| `agent/scripts/aws/common.sh`, `setup.sh`, `deploy.sh`, `README.md` | `back/scripts/aws/` | New: the same pattern, for the agent |
| `agent/docs/16-agente-en-aws.md`, `agent/README.md` | — | New doc and its link |

---

## Group 1: Inbound auth

1. `src/config.py`: add `agent_token: str | None` from `AGENT_TOKEN` (empty string counts as unset).

2. Create `src/inbound_auth.py`:
   - `token_ok(expected, received) -> bool` with `hmac.compare_digest`; `False` when `received` is missing.
   - `add_token_check(app, token)`: an HTTP middleware that lets `GET /health` through and answers `401 {"detail": "unauthorized"}` for any other path without a valid `x-agent-token`. It logs only the path and the status, never the header.

3. `src/main.py`: after `app = server.app`, call `add_token_check(app, settings.agent_token)` only when the token is set, and log at startup whether the check is on.

---

## Group 2: Image

4. Create `agent/.dockerignore`: everything out except `src/`, `configs/`, `pyproject.toml`, `uv.lock`, `README.md`; never `.env*`, `.venv`, `tests`, `spec`, `.databricks`, logs.

5. Create `agent/Dockerfile` (build context `agent/`):
   - build stage on `python:3.13-slim` with `uv`: `uv sync --frozen --no-dev` into `/app/.venv`;
   - final stage: copies the venv, `src/` and `configs/`, runs as a non-root user, `EXPOSE 8080`;
   - `CMD` starts the server on `0.0.0.0:8080` (`start-server --port 8080`, or `uvicorn src.main:app` if the script can't set the host).

6. Build and run it locally with the developer's Databricks profile replaced by the principal's three variables, and check `/health` and one `/invocations` turn with `demo-mx-1`.

---

## Group 3: AWS scripts

7. Create `agent/scripts/aws/common.sh` from the back's: `ECR_REPO=bank-assistant-agent`, `SERVICE=bank-assistant-agent`, `INSTANCE_ROLE=bank-assistant-agent-instance`, `SECRET_PREFIX=bank-assistant/agent`, the same `ACCESS_ROLE` and `SP_SECRET`; `build_and_push` builds `agent/Dockerfile` and refuses uncommitted changes under `agent/`.

8. Create `agent/scripts/aws/setup.sh`:
   - `base`: ECR repository (immutable tags, scan on push) and the instance role, which reads `bank-assistant/agent/*` and `bank-assistant/databricks-sp`;
   - `secrets`: `jev-api-key` from `JEV_API_KEY` in the environment, and `invoke-token` generated with `openssl rand -hex 32` the first time;
   - `service`: creates the App Runner service, 1 vCPU / 2 GB, port 8080, health check `HTTP /health`. Variables: `CLASSIFIER=jev`, `AGENT_TRACING=off`, `LLM_ENDPOINT`, `LAKEBASE_INSTANCE`, `LAKEBASE_DATABASE`, `DEMO_SESSIONS_JSON` (the value of `app.yaml`), `DATABRICKS_HOST`, `DATABRICKS_CLIENT_ID`. Secrets: `DATABRICKS_CLIENT_SECRET`, `JEV_API_KEY`, `AGENT_TOKEN`.

9. Create `agent/scripts/aws/deploy.sh` from the back's: build, push, point the service at the image, wait, and check `/health` (200) and `/invocations` without the token (401).

10. Create `agent/scripts/aws/README.md`: requirements, resources, first time, every deploy, removing everything.

---

## Group 4: Deploy and measure

11. The principal is already verified by w1:pC (grants on `bank_ro` and `bank_sessions.sim_sessions`, instance lookup, credential, Qwen). If w1:pB chooses a principal of its own for the agent, create its secret, set `SP_SECRET` to it and ask w1:pC for the grants on the 3 tables and `sim_sessions`.

12. Run `setup.sh base`, `deploy.sh --push`, `setup.sh secrets`, `setup.sh service`. Give w1:pC the URL; the secret is `bank-assistant/agent/invoke-token`, and w1:pC adds its read to the back's role. The first deploy takes about 10 minutes and the new DNS a few more.

13. Measure against the AWS URL with the token: the scenarios of balance, movements and complaint, 20 turns in total, paced. Report p50 and p95 per turn, and how many turns Jev classified and how many fell to the rules.

14. Write `agent/docs/16-agente-en-aws.md` (what runs where, auth, secrets, costs, the measured latency, what is pending: tracing) and link it from `agent/README.md`.

---

## Group 5: Tests

15. Create `tests/unit/test_inbound_auth.py`: `token_ok` with the right token, a wrong one, an empty one and `None`.

16. Create `tests/integration/test_token_check.py`: a FastAPI app with `add_token_check`: `/health` passes without the header; another path gets 401 without it and with a wrong one, and passes with the right one; the log doesn't contain the token.

17. Extend `tests/e2e/test_invocations.py`: with `AGENT_TOKEN` set, `POST /invocations` answers 401 without the header and 200 with it; with it unset, 200 as today.
