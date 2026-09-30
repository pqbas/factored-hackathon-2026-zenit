#!/usr/bin/env bash
# Refreshes the bank_ro synced tables on demand: one snapshot run of their
# shared pipeline, then the grants again (setup.sh). There is no scheduled
# refresh: the gold tables are static during the hackathon, so this runs after
# each gold update (docs/datos-banco-lakebase.md).
#
#   scripts/bank-ro/refresh.sh [profile]
set -euo pipefail

PROFILE="${1:-DEFAULT}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Any of the seven tables names the shared pipeline.
PIPELINE_ID=$(databricks database get-synced-database-table \
  workspace.bank_ro.customer_360 -p "$PROFILE" -o json |
  jq -r '.data_synchronization_status.pipeline_id')

START=$(date +%s)
UPDATE_ID=$(databricks pipelines start-update "$PIPELINE_ID" -p "$PROFILE" -o json |
  jq -r '.update_id')
echo "Pipeline $PIPELINE_ID, update $UPDATE_ID started"

while true; do
  STATE=$(databricks pipelines get-update "$PIPELINE_ID" "$UPDATE_ID" -p "$PROFILE" -o json |
    jq -r '.update.state')
  case "$STATE" in
    COMPLETED) break ;;
    FAILED | CANCELED)
      echo "Refresh $STATE (update $UPDATE_ID)" >&2
      exit 1
      ;;
  esac
  sleep 15
done
echo "Refresh completed in $(($(date +%s) - START)) s (update $UPDATE_ID)"

"$HERE/setup.sh" "$PROFILE"
