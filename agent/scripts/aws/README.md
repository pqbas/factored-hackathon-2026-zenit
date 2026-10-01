# Agent on AWS App Runner

The same agent of `main` in a container on AWS App Runner (us-west-2), next
to the Databricks App. Spec: `spec/01-10-26-aws-agent/`.

Qwen and Lakebase stay in Databricks; the container reaches both with its own
service principal. It classifies with Jev and has tracing off. Only callers
with the shared token (`x-agent-token`) get past `/health`.

## Requirements

- An AWS session (`aws sts get-caller-identity`), Docker, `jq`, `openssl`.
- The back's base setup (`back/scripts/aws/setup.sh base`), which creates the
  role App Runner pulls images with.
- A Databricks service principal for the agent, `bank-assistant-aws-agent`,
  with an OAuth secret and:
  - its secret in Secrets Manager as `bank-assistant/agent/databricks-sp`, a
    JSON with `DATABRICKS_HOST`, `DATABRICKS_CLIENT_ID` and
    `DATABRICKS_CLIENT_SECRET`;
  - CAN_QUERY on the LLM endpoint;
  - a Postgres role on the Lakebase instance with `SELECT` only on
    `bank_ro.customer_products`, `bank_ro.customer_transactions`,
    `bank_ro.customer_cases` and `bank_sessions.sim_sessions`
    (`back/scripts/aws/lakebase-grants.sql`).

## Resources

All of them are tagged `project=bank-assistant`.

| Resource | Name |
| --- | --- |
| ECR repository | `bank-assistant-agent` |
| IAM role, pulls the image | `bank-assistant-apprunner-ecr-access` (shared with the back) |
| IAM role, reads the secrets | `bank-assistant-agent-instance` |
| Secrets Manager | `bank-assistant/agent/databricks-sp` (the principal, created apart), `bank-assistant/agent/jev-api-key`, `bank-assistant/agent/invoke-token` |
| App Runner service | `bank-assistant-agent` (1 vCPU, 2 GB, health check `/health`) |

## First time

```bash
scripts/aws/setup.sh base            # ECR repository and the instance role
scripts/aws/deploy.sh --push         # build and push the commit's image

export JEV_API_KEY=...
scripts/aws/setup.sh secrets         # the Jev key and a new inbound token

export IMAGE_TAG=<tag printed by deploy.sh --push>
export DEMO_SESSIONS_JSON=...        # the value in agent/app.yaml
scripts/aws/setup.sh service
```

Secrets are typed into the shell or read from a password manager. They never
go into a file of the repo or into the image. The inbound token is generated
by `setup.sh secrets` and never printed; the back reads it from the same
secret.

## Every deploy

```bash
scripts/aws/deploy.sh
```

It builds the image of the current commit, pushes it and points the service
at it. App Runner starts the new version, checks `/health` and only then
moves the traffic, so there is no downtime. The script ends by checking that
`/invocations` without the token answers 401.

The dependencies of the image are pinned in `requirements-aws.lock`. After
changing `pyproject.toml`:

```bash
uv export --frozen --no-dev --no-hashes --no-emit-project -o requirements-aws.lock
```

## Calling it

```bash
TOKEN=$(aws secretsmanager get-secret-value --secret-id bank-assistant/agent/invoke-token \
  --query SecretString --output text)
curl https://<service url>/invocations -H "x-agent-token: $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"input":[{"role":"user","content":"hola"}],"custom_inputs":{"session_token":"demo-mx-1"}}'
```

## Removing everything

Delete the App Runner service, the secrets, the instance role and the ECR
repository, all tagged `project=bank-assistant`.
