#!/bin/bash
# One-time, idempotent setup of the back on AWS App Runner (us-west-2).
#   setup.sh base      ECR repository and the two IAM roles
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
    --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"secretsmanager:GetSecretValue\",\"Resource\":\"arn:aws:secretsmanager:$AWS_REGION:$ACCOUNT:secret:$SECRET_PREFIX/*\"}]}"
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

# Values come from the environment, never from a file of the repo:
#   DATABRICKS_CLIENT_SECRET  the service principal's OAuth secret
#   DEMO_USERS_JSON           see hash-password.mjs
# SESSION_SECRET is generated here the first time.
secrets() {
  : "${DATABRICKS_CLIENT_SECRET:?set DATABRICKS_CLIENT_SECRET}"
  : "${DEMO_USERS_JSON:?set DEMO_USERS_JSON}"
  put_secret databricks-client-secret "$DATABRICKS_CLIENT_SECRET"
  put_secret demo-users "$DEMO_USERS_JSON"
  aws secretsmanager describe-secret --secret-id "$SECRET_PREFIX/session-secret" >/dev/null 2>&1 ||
    put_secret session-secret "$(openssl rand -hex 32)"
}

secret_arn() {
  aws secretsmanager describe-secret --secret-id "$SECRET_PREFIX/$1" --query ARN --output text
}

# Non-secret settings, from the environment:
#   IMAGE_TAG             a tag already pushed (deploy.sh pushes the commit's)
#   DATABRICKS_HOST       https://<workspace>
#   DATABRICKS_CLIENT_ID  the service principal's client id (also PGUSER)
#   PGHOST                the Lakebase instance's host
#   API_PROXY             the agent's /invocations URL
#   ADMIN_EMAILS, ADVISOR_EMAILS   the demo users' emails, by role
#   DEMO_CUSTOMERS_JSON   as in back/app.yaml
service() {
  for name in IMAGE_TAG DATABRICKS_HOST DATABRICKS_CLIENT_ID PGHOST API_PROXY \
    ADMIN_EMAILS ADVISOR_EMAILS DEMO_CUSTOMERS_JSON; do
    [ -n "${!name:-}" ] || { echo "set $name" >&2; exit 1; }
  done
  [ -z "$(service_arn)" ] || { echo "Service $SERVICE already exists; use deploy.sh" >&2; exit 1; }

  local config
  config=$(jq -n \
    --arg image "$IMAGE:$IMAGE_TAG" \
    --arg access "arn:aws:iam::$ACCOUNT:role/$ACCESS_ROLE" \
    --arg host "$DATABRICKS_HOST" --arg client "$DATABRICKS_CLIENT_ID" \
    --arg pghost "$PGHOST" --arg proxy "$API_PROXY" \
    --arg admins "$ADMIN_EMAILS" --arg advisors "$ADVISOR_EMAILS" \
    --arg customers "$DEMO_CUSTOMERS_JSON" \
    --arg sp "$(secret_arn databricks-client-secret)" \
    --arg session "$(secret_arn session-secret)" \
    --arg users "$(secret_arn demo-users)" \
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
            AGENT_QUEUE_WORKER: "off",
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

case "${1:-}" in
  base | secrets | service) "$1" ;;
  *) echo "usage: setup.sh base|secrets|service" >&2; exit 1 ;;
esac
