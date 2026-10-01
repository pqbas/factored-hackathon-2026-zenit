# Shared names of the AWS deployment of the back (spec/01-10-26-aws-back).
# Sourced by setup.sh and deploy.sh.
set -euo pipefail

export AWS_REGION=us-west-2
export AWS_DEFAULT_REGION=us-west-2
PROJECT=bank-assistant
TAGS="Key=project,Value=$PROJECT"

ECR_REPO=$PROJECT-back
SERVICE=$PROJECT-back
ACCESS_ROLE=$PROJECT-apprunner-ecr-access
INSTANCE_ROLE=$PROJECT-back-instance
SECRET_PREFIX=$PROJECT/back

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGISTRY=$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com
IMAGE=$REGISTRY/$ECR_REPO

REPO_ROOT=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)

service_arn() {
  aws apprunner list-services \
    --query "ServiceSummaryList[?ServiceName=='$SERVICE'].ServiceArn | [0]" \
    --output text | grep -v '^None$' || true
}

# Builds the image of the current commit and pushes it; prints its tag.
build_and_push() {
  local tag
  tag=$(git -C "$REPO_ROOT" rev-parse --short=8 HEAD)
  if [ -n "$(git -C "$REPO_ROOT" status --porcelain -- back front Dockerfile.back)" ]; then
    echo "Uncommitted changes in back/ or front/: commit first, the tag is the commit." >&2
    return 1
  fi
  docker build -f "$REPO_ROOT/Dockerfile.back" -t "$IMAGE:$tag" "$REPO_ROOT" >&2
  aws ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRY" >&2
  docker push "$IMAGE:$tag" >&2
  echo "$tag"
}
