#!/bin/bash
# Deploys the current commit of the back to AWS App Runner without downtime:
# builds the image, pushes it tagged with the commit and points the service
# at it. App Runner starts the new version, health-checks /ping and only then
# moves the traffic; a failed start leaves the old version serving.
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

url=$(aws apprunner describe-service --service-arn "$arn" --query 'Service.ServiceUrl' --output text)
while :; do
  status=$(aws apprunner describe-service --service-arn "$arn" --query 'Service.Status' --output text)
  [ "$status" = OPERATION_IN_PROGRESS ] || break
  # The old version keeps answering while the new one starts.
  echo "  $status, /ping $(curl -s -o /dev/null -w '%{http_code}' "https://$url/ping")"
  sleep 15
done
echo "Service: $status, https://$url"
deployed=$(aws apprunner describe-service --service-arn "$arn" \
  --query 'Service.SourceConfiguration.ImageRepository.ImageIdentifier' --output text)
[ "$status" = RUNNING ] && [ "$deployed" = "$IMAGE:$tag" ] ||
  { echo "Deploy failed: the service is on $deployed" >&2; exit 1; }
curl -fsS "https://$url/ping" && echo
curl -fsS "https://$url/api/session" && echo
