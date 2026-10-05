#!/bin/bash
# One-time, idempotent setup of the agent on AWS App Runner (us-west-2).
#   setup.sh base      ECR repository and the instance role
#   setup.sh secrets   Secrets Manager secrets, from the environment
#   setup.sh service   the App Runner service (needs base, secrets, an image)
# Every resource is tagged project=bank-assistant. See README.md.
source "$(dirname "$0")/common.sh"

base() {
  aws ecr describe-repositories --repository-names "$ECR_REPO" >/dev/null 2>&1 ||
    aws ecr create-repository --repository-name "$ECR_REPO" \
      --image-tag-mutability IMMUTABLE \
      --image-scanning-configuration scanOnPush=true \
      --tags "$TAGS" >/dev/null
  echo "ECR repository: $IMAGE"

  # The back's setup creates this role; the agent only needs it to exist.
  aws iam get-role --role-name "$ACCESS_ROLE" >/dev/null ||
    { echo "Role $ACCESS_ROLE is missing: run back/scripts/aws/setup.sh base" >&2; exit 1; }

  # The running container reads only the agent's secrets with this one.
  aws iam get-role --role-name "$INSTANCE_ROLE" >/dev/null 2>&1 ||
    aws iam create-role --role-name "$INSTANCE_ROLE" --tags "$TAGS" \
      --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"tasks.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam put-role-policy --role-name "$INSTANCE_ROLE" --policy-name read-own-secrets \
    --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"secretsmanager:GetSecretValue\",\"Resource\":\"arn:aws:secretsmanager:$AWS_REGION:$ACCOUNT:secret:$SECRET_PREFIX/*\"}]}"
  echo "IAM role: $INSTANCE_ROLE"
}

put_secret() { # full name, value
  if aws secretsmanager describe-secret --secret-id "$1" >/dev/null 2>&1; then
    aws secretsmanager put-secret-value --secret-id "$1" --secret-string "$2" >/dev/null
  else
    aws secretsmanager create-secret --name "$1" --secret-string "$2" --tags "$TAGS" >/dev/null
  fi
  echo "Secret: $1"
}

# JEV_API_KEY comes from the environment, never from a file of the repo. The
# inbound token is generated here the first time and never printed. The
# service principal's secret ($SP_SECRET) is created apart.
secrets() {
  : "${JEV_API_KEY:?set JEV_API_KEY}"
  put_secret "$SECRET_PREFIX/jev-api-key" "$JEV_API_KEY"
  aws secretsmanager describe-secret --secret-id "$TOKEN_SECRET" >/dev/null 2>&1 ||
    put_secret "$TOKEN_SECRET" "$(openssl rand -hex 32)"
}

secret_arn() {
  aws secretsmanager describe-secret --secret-id "$1" --query ARN --output text
}

# Non-secret settings, from the environment:
#   IMAGE_TAG            a tag already pushed (deploy.sh pushes the commit's)
#   DEMO_SESSIONS_JSON   the demo sessions, as in agent/app.yaml
service() {
  for name in IMAGE_TAG DEMO_SESSIONS_JSON; do
    [ -n "${!name:-}" ] || { echo "set $name" >&2; exit 1; }
  done
  [ -z "$(service_arn)" ] || { echo "Service $SERVICE already exists; use deploy.sh" >&2; exit 1; }

  # Host and client id aren't secret; they're read from the principal's
  # secret so there is one source for them.
  local sp host client config
  sp=$(secret_arn "$SP_SECRET")
  host=$(aws secretsmanager get-secret-value --secret-id "$SP_SECRET" --query SecretString --output text | jq -r .DATABRICKS_HOST)
  client=$(aws secretsmanager get-secret-value --secret-id "$SP_SECRET" --query SecretString --output text | jq -r .DATABRICKS_CLIENT_ID)
  config=$(jq -n \
    --arg image "$IMAGE:$IMAGE_TAG" \
    --arg access "arn:aws:iam::$ACCOUNT:role/$ACCESS_ROLE" \
    --arg host "$host" --arg client "$client" \
    --arg sessions "$DEMO_SESSIONS_JSON" \
    --arg sp "$sp:DATABRICKS_CLIENT_SECRET::" \
    --arg jev "$(secret_arn "$SECRET_PREFIX/jev-api-key")" \
    --arg token "$(secret_arn "$TOKEN_SECRET")" \
    '{
      AuthenticationConfiguration: { AccessRoleArn: $access },
      AutoDeploymentsEnabled: false,
      ImageRepository: {
        ImageIdentifier: $image,
        ImageRepositoryType: "ECR",
        ImageConfiguration: {
          Port: "8080",
          RuntimeEnvironmentVariables: {
            CLASSIFIER: "jev",
            AGENT_TRACING: "off",
            LLM_ENDPOINT: "databricks-qwen3-next-80b-a3b-instruct",
            LAKEBASE_INSTANCE: "bank-assistant-chat-db",
            LAKEBASE_DATABASE: "databricks_postgres",
            DATABRICKS_HOST: $host,
            DATABRICKS_CLIENT_ID: $client,
            DEMO_SESSIONS_JSON: $sessions
          },
          RuntimeEnvironmentSecrets: {
            DATABRICKS_CLIENT_SECRET: $sp,
            JEV_API_KEY: $jev,
            AGENT_TOKEN: $token
          }
        }
      }
    }')

  aws apprunner create-service --service-name "$SERVICE" \
    --source-configuration "$config" \
    --instance-configuration "Cpu=1 vCPU,Memory=2 GB,InstanceRoleArn=arn:aws:iam::$ACCOUNT:role/$INSTANCE_ROLE" \
    --health-check-configuration "Protocol=HTTP,Path=/health,Interval=10,Timeout=5,HealthyThreshold=1,UnhealthyThreshold=3" \
    --tags "$TAGS" \
    --query 'Service.[ServiceArn,ServiceUrl,Status]' --output text
}

case "${1:-}" in
  base | secrets | service) "$1" ;;
  *) echo "usage: setup.sh base|secrets|service" >&2; exit 1 ;;
esac
