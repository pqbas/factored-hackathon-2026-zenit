#!/usr/bin/env bash
# Creates the bank_ro synced tables (tables.tsv) in the Lakebase instance, all
# in one snapshot pipeline, then runs the first sync and the grants
# (refresh.sh). Run check-keys.sql on the warehouse first: a synced table needs
# a unique primary key.
#
# The first table creates the pipeline; the others join it with
# existing_pipeline_id, which doesn't start a run, so the data is copied once,
# by refresh.sh.
#
#   scripts/bank-ro/create.sh [profile]
set -euo pipefail

PROFILE="${1:-DEFAULT}"
INSTANCE=bank-assistant-chat-db
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

databricks schemas get workspace.bank_ro -p "$PROFILE" >/dev/null 2>&1 ||
  databricks schemas create bank_ro workspace -p "$PROFILE" \
    --comment "Read-only Lakebase copies (synced tables) of the bank tables the agent and the back read. See back/scripts/bank-ro/." >/dev/null

PIPELINE_ID=""
while IFS=$'\t' read -r name source keys; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  if databricks database get-synced-database-table "workspace.bank_ro.$name" -p "$PROFILE" >/dev/null 2>&1; then
    echo "exists  workspace.bank_ro.$name"
  else
    if [[ -z "$PIPELINE_ID" ]]; then
      pipeline='{"new_pipeline_spec": {"storage_catalog": "workspace", "storage_schema": "bank_ro"}}'
    else
      pipeline=$(jq -nc --arg p "$PIPELINE_ID" '{existing_pipeline_id: $p}')
    fi
    body=$(jq -nc --arg n "workspace.bank_ro.$name" --arg s "$source" --arg i "$INSTANCE" \
      --arg k "$keys" --argjson pipeline "$pipeline" \
      '{name: $n, database_instance_name: $i, logical_database_name: "databricks_postgres",
        spec: ({source_table_full_name: $s, primary_key_columns: ($k | split(",")),
                scheduling_policy: "SNAPSHOT", create_database_objects_if_missing: true} + $pipeline)}')
    databricks database create-synced-database-table --json "$body" -p "$PROFILE" >/dev/null
    echo "created workspace.bank_ro.$name <- $source ($keys)"
  fi
  [[ -z "$PIPELINE_ID" ]] && PIPELINE_ID=$(databricks database get-synced-database-table \
    "workspace.bank_ro.$name" -p "$PROFILE" -o json | jq -r '.data_synchronization_status.pipeline_id')
done <"$HERE/tables.tsv"
echo "Pipeline $PIPELINE_ID"

"$HERE/refresh.sh" "$PROFILE"
