#!/bin/bash
# One-time, idempotent setup of the back on AWS App Runner (us-west-2).
#   setup.sh base      ECR repository and the two IAM roles
#   setup.sh secrets   Secrets Manager secrets, from the environment
#   setup.sh service   the App Runner service (needs base, secrets, an image)
#   setup.sh agent URL point the service at the agent on AWS (its /invocations)
#   setup.sh env K=V.. set plain (non-secret) variables of the running service
# Every resource is tagged project=bank-assistant. See README.md.
source "$(dirname "$0")/common.sh"

base() {
  aws ecr describe-repositories --repository-names "$ECR_REPO" >/dev/null 2>&1 ||
    aws ecr create-repository --repository-name "$ECR_REPO" \
      --image-tag-mutability IMMUTABLE \
      --image-scanning-configuration scanOnPush=true \
      --tags "$TAGS" >/dev/null
  echo "ECR repository: $IMAGE"

  # App Runner pulls the image with this role.
  aws iam get-role --role-name "$ACCESS_ROLE" >/dev/null 2>&1 ||
    aws iam create-role --role-name "$ACCESS_ROLE" --tags "$TAGS" \
      --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"build.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name "$ACCESS_ROLE" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess

  # The running container reads only its own secrets with this one.
  aws iam get-role --role-name "$INSTANCE_ROLE" >/dev/null 2>&1 ||
    aws iam create-role --role-name "$INSTANCE_ROLE" --tags "$TAGS" \
      --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"tasks.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam put-role-policy --role-name "$INSTANCE_ROLE" --policy-name read-own-secrets \
    --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"secretsmanager:GetSecretValue\",\"Resource\":[\"arn:aws:secretsmanager:$AWS_REGION:$ACCOUNT:secret:$SECRET_PREFIX/*\",\"arn:aws:secretsmanager:$AWS_REGION:$ACCOUNT:secret:$SP_SECRET-*\",\"arn:aws:secretsmanager:$AWS_REGION:$ACCOUNT:secret:$AGENT_TOKEN_SECRET-*\"]}]}"
  echo "IAM roles: $ACCESS_ROLE, $INSTANCE_ROLE"
}

put_secret() { # name, value
  if aws secretsmanager describe-secret --secret-id "$SECRET_PREFIX/$1" >/dev/null 2>&1; then
    aws secretsmanager put-secret-value --secret-id "$SECRET_PREFIX/$1" --secret-string "$2" >/dev/null
  else
    aws secretsmanager create-secret --name "$SECRET_PREFIX/$1" --secret-string "$2" --tags "$TAGS" >/dev/null
  fi
  echo "Secret: $SECRET_PREFIX/$1"
}

# DEMO_USERS_JSON comes from the environment (see hash-password.mjs), never
# from a file of the repo. SESSION_SECRET is generated here the first time.
# The service principal's secret ($SP_SECRET) is created apart.
secrets() {
  : "${DEMO_USERS_JSON:?set DEMO_USERS_JSON}"
  put_secret demo-users "$DEMO_USERS_JSON"
  aws secretsmanager describe-secret --secret-id "$SECRET_PREFIX/session-secret" >/dev/null 2>&1 ||
    put_secret session-secret "$(openssl rand -hex 32)"
}

secret_arn() {
  aws secretsmanager describe-secret --secret-id "$1" --query ARN --output text
}

# Non-secret settings, from the environment:
#   IMAGE_TAG             a tag already pushed (deploy.sh pushes the commit's)
#   PGHOST                the Lakebase instance's host
#   API_PROXY             the agent's /invocations URL
#   ADMIN_EMAILS, ADVISOR_EMAILS   the demo users' emails, by role
#   DEMO_CUSTOMERS_JSON   as in back/app.yaml
service() {
  for name in IMAGE_TAG PGHOST API_PROXY \
    ADMIN_EMAILS ADVISOR_EMAILS DEMO_CUSTOMERS_JSON; do
    [ -n "${!name:-}" ] || { echo "set $name" >&2; exit 1; }
  done
  [ -z "$(service_arn)" ] || { echo "Service $SERVICE already exists; use deploy.sh" >&2; exit 1; }

  # Host and client id aren't secret; they're read from the principal's
  # secret so there is one source for them. PGUSER is the client id.
  local sp host client config
  sp=$(secret_arn "$SP_SECRET")
  host=$(aws secretsmanager get-secret-value --secret-id "$SP_SECRET" --query SecretString --output text | jq -r .DATABRICKS_HOST)
  client=$(aws secretsmanager get-secret-value --secret-id "$SP_SECRET" --query SecretString --output text | jq -r .DATABRICKS_CLIENT_ID)
  config=$(jq -n \
    --arg image "$IMAGE:$IMAGE_TAG" \
    --arg access "arn:aws:iam::$ACCOUNT:role/$ACCESS_ROLE" \
    --arg host "$host" --arg client "$client" \
    --arg pghost "$PGHOST" --arg proxy "$API_PROXY" \
    --arg admins "$ADMIN_EMAILS" --arg advisors "$ADVISOR_EMAILS" \
    --arg customers "$DEMO_CUSTOMERS_JSON" \
    --arg sp "$sp:DATABRICKS_CLIENT_SECRET::" \
    --arg session "$(secret_arn "$SECRET_PREFIX/session-secret")" \
    --arg users "$(secret_arn "$SECRET_PREFIX/demo-users")" \
    '{
      AuthenticationConfiguration: { AccessRoleArn: $access },
      AutoDeploymentsEnabled: false,
      ImageRepository: {
        ImageIdentifier: $image,
        ImageRepositoryType: "ECR",
        ImageConfiguration: {
          Port: "8080",
          RuntimeEnvironmentVariables: {
            AUTH_MODE: "password",
            AGENT_QUEUE_WORKER: "on",
            DATABRICKS_HOST: $host,
            DATABRICKS_CLIENT_ID: $client,
            PGHOST: $pghost,
            PGUSER: $client,
            PGDATABASE: "databricks_postgres",
            PGPORT: "5432",
            PGSSLMODE: "require",
            API_PROXY: $proxy,
            ADMIN_EMAILS: $admins,
            ADVISOR_EMAILS: $advisors,
            DEMO_CUSTOMERS_JSON: $customers
          },
          RuntimeEnvironmentSecrets: {
            DATABRICKS_CLIENT_SECRET: $sp,
            SESSION_SECRET: $session,
            DEMO_USERS_JSON: $users
          }
        }
      }
    }')

  aws apprunner create-service --service-name "$SERVICE" \
    --source-configuration "$config" \
    --instance-configuration "Cpu=1 vCPU,Memory=2 GB,InstanceRoleArn=arn:aws:iam::$ACCOUNT:role/$INSTANCE_ROLE" \
    --health-check-configuration "Protocol=HTTP,Path=/ping,Interval=10,Timeout=5,HealthyThreshold=1,UnhealthyThreshold=3" \
    --tags "$TAGS" \
    --query 'Service.[ServiceArn,ServiceUrl,Status]' --output text
}

# Points the running service at the agent on AWS: API_PROXY becomes its
# /invocations URL and AGENT_TOKEN comes from the agent's secret, so the back
# sends x-agent-token instead of the Databricks token. To go back to the
# Databricks App, run it with that App's URL and --databricks.
agent() {
  local url=${1:?usage: setup.sh agent <https://.../invocations> [--databricks]}
  local arn config
  arn=$(service_arn)
  [ -n "$arn" ] || { echo "No service $SERVICE" >&2; exit 1; }
  config=$(aws apprunner describe-service --service-arn "$arn" \
    --query 'Service.SourceConfiguration' --output json |
    jq --arg url "$url" '.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables.API_PROXY = $url')
  if [ "${2:-}" = "--databricks" ]; then
    config=$(jq 'del(.ImageRepository.ImageConfiguration.RuntimeEnvironmentSecrets.AGENT_TOKEN)' <<<"$config")
  else
    config=$(jq --arg token "$(secret_arn "$AGENT_TOKEN_SECRET")" \
      '.ImageRepository.ImageConfiguration.RuntimeEnvironmentSecrets.AGENT_TOKEN = $token' <<<"$config")
  fi
  aws apprunner update-service --service-arn "$arn" \
    --source-configuration "$config" --query 'Service.Status' --output text
}

# Sets plain variables of the running service, e.g. AGENT_QUEUE_WORKER=on.
# Not for secrets: those go through Secrets Manager.
env_vars() {
  [ $# -gt 0 ] || { echo "usage: setup.sh env KEY=VALUE..." >&2; exit 1; }
  local arn config pair
  arn=$(service_arn)
  [ -n "$arn" ] || { echo "No service $SERVICE" >&2; exit 1; }
  config=$(aws apprunner describe-service --service-arn "$arn" \
    --query 'Service.SourceConfiguration' --output json)
  for pair in "$@"; do
    [[ $pair == *=* ]] || { echo "Not KEY=VALUE: $pair" >&2; exit 1; }
    config=$(jq --arg key "${pair%%=*}" --arg value "${pair#*=}" \
      '.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables[$key] = $value' <<<"$config")
  done
  aws apprunner update-service --service-arn "$arn" \
    --source-configuration "$config" --query 'Service.Status' --output text
}

case "${1:-}" in
  base | secrets | service) "$1" ;;
  agent) shift; agent "$@" ;;
  env) shift; env_vars "$@" ;;
  *) echo "usage: setup.sh base|secrets|service|agent <url>|env KEY=VALUE..." >&2; exit 1 ;;
esac
