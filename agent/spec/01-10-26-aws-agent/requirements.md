# Requirements: the agent on AWS App Runner

Stage 2 of `spec/01-10-26-despliegue-aws/`: the same agent of `main` runs in a container on AWS App Runner (us-west-2, 1 vCPU / 2 GB), next to the Databricks App, which is not touched. Qwen and Lakebase stay in Databricks and are reached with the agent's own service principal, `bank-assistant-aws-agent`. The request and response contract of `POST /invocations` doesn't change, so the back only changes the URL and adds one header.

## 1. Functional requirements

After this phase, the agent keeps doing what it does today:

1. The Databricks App (`agent-banking-assistant`) is not redeployed or reconfigured; `app.yaml` and `databricks.yml` don't change.
2. `POST /invocations` takes the same body (`input`, `custom_inputs`, `stream`) and answers the same JSON or SSE, with the same `custom_outputs`.
3. Demo sessions (`DEMO_SESSIONS_JSON` or the defaults) and `sim-` sessions (`bank_sessions.sim_sessions`, fail-closed) resolve as today.
4. The bank data tools read `bank_ro` in Lakebase through the pool, with the 5 s timeouts.
5. With no `AGENT_TOKEN` set (local dev, the Databricks App), `/invocations` needs no header, as today.

And it changes in these ways:

6. A Docker image of the agent (`agent/Dockerfile`, linux/amd64, non-root user, dependencies pinned in `agent/requirements-aws.lock`) starts the server on port 8080. No secret is in the image.
7. On App Runner the agent runs with `CLASSIFIER=jev`. The Jev key comes from Secrets Manager. If Jev doesn't answer in its timeout, the turn is classified with the rules, as today.
8. Qwen and Lakebase are reached with `DATABRICKS_HOST`, `DATABRICKS_CLIENT_ID` and `DATABRICKS_CLIENT_SECRET` of the principal; the secret is read from `bank-assistant/agent/databricks-sp`.
9. Tracing is off (`AGENT_TRACING=off`): no MLflow, no Langfuse.
10. Inbound auth: when `AGENT_TOKEN` is set, every request except `GET /health` must carry it in the `x-agent-token` header. A missing or wrong token gets 401 and never reaches the graph. The comparison is constant-time and the token is never logged.
11. `scripts/aws/setup.sh` creates the resources once (ECR repository, instance role, secrets, service) and `scripts/aws/deploy.sh` builds the commit's image and deploys it without downtime. Every resource is tagged `project=bank-assistant`.
12. The latency per turn against the AWS agent, with Jev, is measured and reported (p50 and p95, and the classify step apart).

## 2. Decisions

- App Runner and not AgentCore Runtime, by the user's decision: it needs no change in the request contract and repeats the pattern the back already runs.
- A shared token in a header and not IAM (SigV4) or a private service, because the back only has to add one header and the token lives in Secrets Manager; a public URL with no check isn't acceptable. The header is `x-agent-token` and not `Authorization`, because the back's provider already puts its Databricks token there.
- The check is a middleware in `src/main.py`, off when `AGENT_TOKEN` is unset, so local dev, the tests and the Databricks App behave as today.
- App Runner injects the secrets as environment variables (`RuntimeEnvironmentSecrets`), so the agent's code reads no AWS API and needs no `boto3`.
- The scripts live in `agent/scripts/aws/` and copy the back's (`back/scripts/aws/`). They reuse the role `bank-assistant-apprunner-ecr-access` and add their own instance role, which reads only the agent's secrets.
- The Lakebase pool keeps resolving the instance by name with the SDK: w1:pC verified with the principal's token that the instance lookup, the credential and a Qwen call answer 200.
- The AWS agent has its own principal, `bank-assistant-aws-agent` (secret `bank-assistant/agent/databricks-sp`), by w1:pB's decision: it reads only `customer_products`, `customer_transactions`, `customer_cases` and `sim_sessions`, like the agent's principal on Databricks, instead of the back's, which reads the 7 tables of `bank_ro` and writes `ai_chatbot`.
- The 401 has a fixed body with no detail of the request or the token, as w1:pC asked.
- Tracing stays off; how to trace (Langfuse or other) is decided later and is out of scope.
- Out of scope: auto scaling settings, a custom domain, WAF, rotating the token, and running the evaluation against AWS (stage 3, the back's).

## 3. Context

- `spec/01-10-26-despliegue-aws/` (requirements and plan, stage 2, blocks 1 and 2).
- Existing patterns: `back/scripts/aws/common.sh`, `setup.sh`, `deploy.sh`, `README.md`, `Dockerfile.back`.
- `agent/src/main.py` (`AgentServer`, `app`), `agent/src/config.py`, `agent/src/tools/lakebase.py`, `agent/src/llm/jev.py`, `agent/app.yaml` (the settings to mirror).
