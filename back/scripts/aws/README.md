# Back on AWS App Runner

The same back of `main`, with the UI compiled in, running on AWS App Runner
(us-west-2) next to the Databricks App. Spec: `back/spec/01-10-26-aws-back/`.

Conversations and the bank's data stay in Lakebase, and the agent stays where
`API_PROXY` points. The container reaches both with a Databricks service
principal. Users sign in with the demo login (`AUTH_MODE=password`).

## Requirements

- An AWS session (`aws sts get-caller-identity`), Docker, `jq`, `openssl`.
- A Databricks service principal with an OAuth secret and:
  - the `workspace-access` entitlement and CAN_USE on the agent's App
    (without the entitlement the App answers 302);
  - its secret in Secrets Manager as `bank-assistant/databricks-sp`, a JSON
    with `DATABRICKS_HOST`, `DATABRICKS_CLIENT_ID` and
    `DATABRICKS_CLIENT_SECRET`;
  - a Postgres role on the Lakebase instance: `lakebase-grants.sql` creates
    it, with read and write on `ai_chatbot` and read on `bank_ro` and
    `bank_sessions`.

## Resources

All of them are tagged `project=bank-assistant`.

| Resource | Name |
| --- | --- |
| ECR repository | `bank-assistant-back` |
| IAM role, pulls the image | `bank-assistant-apprunner-ecr-access` |
| IAM role, reads the secrets | `bank-assistant-back-instance` |
| Secrets Manager | `bank-assistant/databricks-sp` (the principal, created apart), `bank-assistant/back/session-secret`, `bank-assistant/back/demo-users` |
| App Runner service | `bank-assistant-back` (1 vCPU, 2 GB, health check `/ping`) |

## First time

```bash
scripts/aws/setup.sh base            # ECR repository and IAM roles
scripts/aws/deploy.sh --push         # build and push the commit's image

# One hash per demo user (admin, asesor, cliente):
printf '%s' "$PASSWORD" | node scripts/aws/hash-password.mjs
export DEMO_USERS_JSON='[{"username":"admin","email":"...","name":"...","passwordHash":"..."}]'
scripts/aws/setup.sh secrets

export IMAGE_TAG=<tag printed by deploy.sh --push>
export PGHOST=... API_PROXY=...
export ADMIN_EMAILS=... ADVISOR_EMAILS=... DEMO_CUSTOMERS_JSON=...
scripts/aws/setup.sh service
```

Secrets are typed into the shell or read from a password manager. They never
go into a file of the repo or into the image.

## Every deploy

```bash
scripts/aws/deploy.sh
```

It builds the image of the current commit, pushes it and points the service
at it. App Runner starts the new version, checks `/ping` and only then moves
the traffic, so there is no downtime. If the new version fails its health
check (a missing secret makes `/ping` answer 503), the old one keeps serving
and the script exits with an error.

To go back, check out the previous commit and run `deploy.sh` again: its
image is already in ECR.

## Pointing at the agent on AWS

```bash
scripts/aws/setup.sh base                                   # lets the role read the agent's token
scripts/aws/setup.sh agent https://<agent>/invocations      # API_PROXY + AGENT_TOKEN
scripts/aws/setup.sh agent https://<databricks app>/invocations --databricks   # back to Databricks
```

With `AGENT_TOKEN` the back sends the shared secret
(`bank-assistant/agent/invoke-token`) in `x-agent-token` and no Databricks
token. Without it, it sends the service principal's OAuth token, as the
Databricks App expects.

## What this deployment does not do

- It runs no migrations. The Databricks deploy applies them to the shared
  database, so deploy Databricks first when there is a new one.
- It does not answer queued agent turns (`AGENT_QUEUE_WORKER=off`): the
  Databricks App's worker does.

## Removing everything

Delete the App Runner service, the secrets, the two IAM roles and the
ECR repository, all tagged `project=bank-assistant`.
