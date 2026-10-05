# Local integration with the original application

The separate dispute demo is removed. The current ML branch incorporates `origin/main` at `d79df69` (PR #131), preserving the team's React frontend, Express backend and LangGraph agent. The training code and results remain in `ml/`.

## Run locally

Use three terminals. The commands below do not run migrations, populate a database or deploy an app. They use the existing personal Databricks profile for authentication and LLM calls. The browser requires a working internet connection to Databricks even though the three application processes run locally.

Agent (Python 3.13 was used; Python 3.14 failed building an existing dependency):

```bash
cd /home/diego/Escritorio/factored-hackathon-2026-bank-assistant/agent
uv sync --python /usr/bin/python3
DATABRICKS_CONFIG_PROFILE=personal AGENT_TRACING=off CLASSIFIER=llm \
  BANK_READ_SOURCE=databricks \
  .venv/bin/python -m uvicorn src.main:app --host 127.0.0.1 --port 8000 --reload
```

Backend, with chat persistence disabled:

```bash
cd /home/diego/Escritorio/factored-hackathon-2026-bank-assistant/back
npm ci --no-audit --no-fund
env -u POSTGRES_URL -u PGHOST -u PGDATABASE -u DATABASE_URL \
  DATABRICKS_CONFIG_PROFILE=personal \
  API_PROXY=http://127.0.0.1:8000/invocations BANK_READ_SOURCE=databricks \
  npm run dev
```

Frontend:

```bash
cd /home/diego/Escritorio/factored-hackathon-2026-bank-assistant/front
npm ci --no-audit --no-fund
npm run dev -- --host 127.0.0.1
```

Open **http://127.0.0.1:3000**. Backend: port 3001. Agent: port 8000. The old standalone demo on port 8010 is stopped and deleted.

These commands assume the ignored `agent/.env` and `back/.env` do not contain overrides. No `.env` existed during validation. `agent/src/main.py` loads its `.env` with override enabled. Keep DB credentials and operational persistence settings out of a read-only local launch. `/api/config` must report `chatHistory: false`.

Do not use `back/npm run build` for this launch: that script runs `db:migrate`. `npm run build:server` is the safe server-only build. Do not use the default backend Playwright config for a no-database validation: it creates/replaces a bank fixture database even in ephemeral mode.

## What works and what is blocked

- The original David interface runs and a real greeting traverses all three original services.
- The original complaint route runs `get_fraud_assessment`, reads the preserved V5/V6 aggregate evidence and returns `score_status: not_validated`, `risk_score: null`, and human-review policy.
- The existing verified complaint handoff includes the assessment for the advisor. Backend fact preservation and frontend notice were tested with fixtures.
- Real bank lookup is blocked for the personal identity: Lakebase rejects the login, Gold lacks `USE SCHEMA`, and several Silver tables lack `SELECT`. No permission grant was executed.
- Chat history, persistence, queued work and advisor handoff storage are disabled in this local launch. No live claim/refund/block/handoff write was performed.
- There is no deployable predictive fraud artifact. Aggregate precision is not a transaction probability, and this integration does not enable automatic financial decisions.

`BANK_READ_SOURCE=databricks` is explicit and optional. It selects parameterized read-only queries against existing tables. Without it, the original Lakebase path remains the default. `BANK_SQL_WAREHOUSE_ID` can select an existing authorized warehouse; the default matches the repository's warehouse resource. This setting does not grant data access.

## Safe automated checks

```bash
cd /home/diego/Escritorio/factored-hackathon-2026-bank-assistant/agent
AGENT_TRACING=off .venv/bin/python -m pytest tests/unit tests/integration -q
cd ../back
npm run test:unit
npm run build:server
cd ../front
npm test
npm run build
cd ..
python -m pytest ml/tests/ -q
```

`back/npm run test:unit` uses a separate configuration with no web-server or database fixture setup. It does not load the default Playwright configuration.

## Review and validation

See [the integration spec](ml/spec/28-09-26-fraud-model/dispute_integration.md) and [the observed validation report](ml/reports/2026-10-04/main_integration_report.md). Changes and the merge are local commits on `feat/diego-ml-fraud-features`; no push or deployment was performed.
