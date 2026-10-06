#!/bin/bash
# Deploys ZenitStack (spec/05-10-26-cdk-cloudfront): builds the front of the
# current checkout and runs cdk deploy with the image tags of the back and the
# agent. The images are the ones back/scripts/aws/deploy.sh --push and
# agent/scripts/aws/deploy.sh --push already push to ECR.
#   BACK_TAG=<tag> AGENT_TAG=<tag> scripts/deploy.sh
# Without tags it uses the images the bank-assistant-* services run now.
set -euo pipefail
export AWS_REGION=us-west-2 AWS_DEFAULT_REGION=us-west-2

INFRA=$(cd "$(dirname "$0")/.." && pwd)
REPO_ROOT=$(git -C "$INFRA" rev-parse --show-toplevel)

current_tag() { # service name
  local arn
  arn=$(aws apprunner list-services \
    --query "ServiceSummaryList[?ServiceName=='$1'].ServiceArn | [0]" --output text)
  aws apprunner describe-service --service-arn "$arn" \
    --query 'Service.SourceConfiguration.ImageRepository.ImageIdentifier' --output text |
    sed 's/.*://'
}

BACK_TAG=${BACK_TAG:-$(current_tag bank-assistant-back)}
AGENT_TAG=${AGENT_TAG:-$(current_tag bank-assistant-agent)}
echo "Images: back $BACK_TAG, agent $AGENT_TAG"

# The front must match the back: the back's tag is its commit.
head=$(git -C "$REPO_ROOT" rev-parse --short=8 HEAD)
[ "$head" = "$BACK_TAG" ] ||
  echo "Note: the front is built from $head, the back image is $BACK_TAG." >&2

npm --prefix "$REPO_ROOT/front" ci
npm --prefix "$REPO_ROOT/front" run build

cd "$INFRA"
npx cdk deploy ZenitStack \
  -c backTag="$BACK_TAG" -c agentTag="$AGENT_TAG" \
  --require-approval never --outputs-file cdk.out/outputs.json
