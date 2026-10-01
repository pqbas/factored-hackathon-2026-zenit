# Shared names of the AWS deployment of the agent (spec/01-10-26-aws-agent).
# Sourced by setup.sh and deploy.sh. Same pattern as back/scripts/aws.
set -euo pipefail

export AWS_REGION=us-west-2
export AWS_DEFAULT_REGION=us-west-2
PROJECT=bank-assistant
TAGS="Key=project,Value=$PROJECT"

ECR_REPO=$PROJECT-agent
SERVICE=$PROJECT-agent
# Shared with the back: App Runner pulls images with it.
ACCESS_ROLE=$PROJECT-apprunner-ecr-access
INSTANCE_ROLE=$PROJECT-agent-instance
SECRET_PREFIX=$PROJECT/agent
# The agent's own Databricks service principal, created apart: a JSON with
# DATABRICKS_HOST, DATABRICKS_CLIENT_ID and DATABRICKS_CLIENT_SECRET.
SP_SECRET=$SECRET_PREFIX/databricks-sp
# The token the back sends in x-agent-token; the back's role reads it too.
TOKEN_SECRET=$SECRET_PREFIX/invoke-token

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGISTRY=$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com
IMAGE=$REGISTRY/$ECR_REPO

REPO_ROOT=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)

service_arn() {
  aws apprunner list-services \
    --query "ServiceSummaryList[?ServiceName=='$SERVICE'].ServiceArn | [0]" \
    --output text | grep -v '^None$' || true
}

service_url() {
  aws apprunner describe-service --service-arn "$1" --query 'Service.ServiceUrl' --output text
}

# Builds the image of the current commit and pushes it; prints its tag.
build_and_push() {
  local tag
  tag=$(git -C "$REPO_ROOT" rev-parse --short=8 HEAD)
  if [ -n "$(git -C "$REPO_ROOT" status --porcelain -- agent)" ]; then
    echo "Uncommitted changes in agent/: commit first, the tag is the commit." >&2
    return 1
  fi
  docker build -t "$IMAGE:$tag" "$REPO_ROOT/agent" >&2
  aws ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRY" >&2
  docker push "$IMAGE:$tag" >&2
  echo "$tag"
}
