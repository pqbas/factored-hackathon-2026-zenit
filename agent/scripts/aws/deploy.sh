#!/bin/bash
# Deploys the current commit of the agent to AWS App Runner without downtime:
# builds the image, pushes it tagged with the commit and points the service
# at it. App Runner starts the new version, health-checks /health and only
# then moves the traffic; a failed start leaves the old version serving.
#   deploy.sh          build, push and deploy
#   deploy.sh --push   build and push only (before the service exists)
source "$(dirname "$0")/common.sh"

tag=$(build_and_push)
echo "Image: $IMAGE:$tag"
[ "${1:-}" = "--push" ] && exit 0

arn=$(service_arn)
[ -n "$arn" ] || { echo "No service $SERVICE yet: IMAGE_TAG=$tag setup.sh service" >&2; exit 1; }

# Only the image changes; the service keeps its variables and secrets.
config=$(aws apprunner describe-service --service-arn "$arn" \
  --query 'Service.SourceConfiguration' --output json |
  jq --arg image "$IMAGE:$tag" '.ImageRepository.ImageIdentifier = $image')
aws apprunner update-service --service-arn "$arn" \
  --source-configuration "$config" --query 'OperationId' --output text

url=$(service_url "$arn")
while :; do
  status=$(aws apprunner describe-service --service-arn "$arn" --query 'Service.Status' --output text)
  [ "$status" = OPERATION_IN_PROGRESS ] || break
  # The old version keeps answering while the new one starts.
  echo "  $status, /health $(curl -s -o /dev/null -w '%{http_code}' "https://$url/health")"
  sleep 15
done
echo "Service: $status, https://$url"
deployed=$(aws apprunner describe-service --service-arn "$arn" \
  --query 'Service.SourceConfiguration.ImageRepository.ImageIdentifier' --output text)
[ "$status" = RUNNING ] && [ "$deployed" = "$IMAGE:$tag" ] ||
  { echo "Deploy failed: the service is on $deployed" >&2; exit 1; }
curl -fsS "https://$url/health" && echo
# The service must never answer without the token.
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "https://$url/invocations" \
  -H 'content-type: application/json' -d '{"input":[]}')
[ "$code" = 401 ] || { echo "/invocations without the token answered $code, expected 401" >&2; exit 1; }
echo "/invocations without the token: 401"
