#!/usr/bin/env bash
# TEST FIXTURE: a refresh of a snapshot synced table brings the source's
# changes to Lakebase. Same approach as data/pipeline/90_test_update_correctness.py:
# a small, clearly labeled fixture in isolated schemas (workspace.bank_ro_test
# in Unity Catalog, bank_ro_test in Postgres), never the real tables, and
# everything dropped at the end unless --keep.
#
#   Step | Source (Delta)                 | Expected in Postgres after the sync
#   1    | F-1 = v1, F-2 = v1             | 2 rows, F-1 = v1
#   2    | F-1 = v2 (update), F-3 (new)   | 3 rows, F-1 = v2, F-3 present
#
#   scripts/bank-ro/test-freshness.sh [--keep] [profile]
set -euo pipefail

KEEP=0
[[ "${1:-}" == "--keep" ]] && KEEP=1 && shift
PROFILE="${1:-DEFAULT}"
INSTANCE=bank-assistant-chat-db
WAREHOUSE="${DATABRICKS_WAREHOUSE_ID:-07ca55766c9c5097}"
UC_SCHEMA=workspace.bank_ro_test
# The Delta source and its synced table (a synced table needs its own name).
SOURCE="$UC_SCHEMA.fixture_source"
TABLE="$UC_SCHEMA.fixture"

# One SQL statement on the warehouse; fails if it doesn't succeed.
warehouse() {
  local body state
  body=$(jq -nc --arg s "$1" --arg w "$WAREHOUSE" \
    '{statement: $s, warehouse_id: $w, wait_timeout: "50s", on_wait_timeout: "CANCEL"}')
  state=$(databricks api post /api/2.0/sql/statements --json "$body" -p "$PROFILE" |
    jq -r '.status.state + " " + (.status.error.message // "")')
  [[ "$state" == SUCCEEDED* ]] || { echo "Warehouse: $state" >&2; exit 1; }
}

HOST=$(databricks database get-database-instance "$INSTANCE" -p "$PROFILE" -o json |
  jq -r '.read_write_dns')
USER_NAME=$(databricks current-user me -p "$PROFILE" -o json | jq -r '.userName')
postgres() {
  local token
  token=$(databricks database generate-database-credential -p "$PROFILE" -o json \
    --json "{\"instance_names\":[\"$INSTANCE\"],\"request_id\":\"$(uuidgen)\"}" |
    jq -r '.token')
  docker exec -e PGPASSWORD="$token" back-test-pg psql -X -A -t \
    "host=$HOST dbname=databricks_postgres user=$USER_NAME sslmode=require" -c "$1"
}

pipeline_id() {
  databricks database get-synced-database-table "$TABLE" -p "$PROFILE" -o json |
    jq -r '.data_synchronization_status.pipeline_id'
}

# Waits for the pipeline's latest update to finish.
wait_update() {
  local pipeline state
  pipeline=$(pipeline_id)
  while true; do
    state=$(databricks pipelines list-updates "$pipeline" -p "$PROFILE" -o json |
      jq -r '.updates[0].state // "WAITING"')
    case "$state" in
      COMPLETED) return ;;
      FAILED | CANCELED) echo "Pipeline update $state" >&2; exit 1 ;;
    esac
    sleep 15
  done
}

check() {
  local name="$1" got="$2" want="$3"
  if [[ "$got" == "$want" ]]; then
    echo "PASS  $name ($got)"
  else
    echo "FAIL  $name: got '$got', want '$want'"
    FAILED=1
  fi
}

cleanup() {
  if [[ $KEEP -eq 1 ]]; then
    echo "Kept $TABLE and bank_ro_test (--keep)"
    return
  fi
  local pipeline
  pipeline=$(pipeline_id 2>/dev/null || true)
  databricks database delete-synced-database-table "$TABLE" -p "$PROFILE" >/dev/null 2>&1 || true
  [[ -n "$pipeline" && "$pipeline" != null ]] &&
    databricks pipelines delete "$pipeline" -p "$PROFILE" >/dev/null 2>&1 || true
  postgres "DROP SCHEMA IF EXISTS bank_ro_test CASCADE" >/dev/null || true
  warehouse "DROP SCHEMA IF EXISTS $UC_SCHEMA CASCADE" || true
  echo "Cleaned up $UC_SCHEMA and bank_ro_test"
}
trap cleanup EXIT

FAILED=0
echo "== Step 1: fixture with F-1 = v1, F-2 = v1, first sync"
warehouse "CREATE SCHEMA IF NOT EXISTS $UC_SCHEMA COMMENT 'TEST FIXTURE for scripts/bank-ro/test-freshness.sh'"
warehouse "CREATE OR REPLACE TABLE $SOURCE (id STRING NOT NULL, value STRING, updated_at TIMESTAMP) COMMENT 'TEST FIXTURE: synthetic rows, not bank data'"
warehouse "INSERT INTO $SOURCE VALUES ('F-1', 'v1', current_timestamp()), ('F-2', 'v1', current_timestamp())"
databricks database create-synced-database-table -p "$PROFILE" -o json --json "$(jq -nc \
  --arg n "$TABLE" --arg s "$SOURCE" --arg i "$INSTANCE" \
  '{name: $n, database_instance_name: $i, logical_database_name: "databricks_postgres",
    spec: {source_table_full_name: $s, primary_key_columns: ["id"],
           scheduling_policy: "SNAPSHOT", create_database_objects_if_missing: true,
           new_pipeline_spec: {storage_catalog: "workspace", storage_schema: "bank_ro_test"}}}')" >/dev/null
sleep 20
wait_update
check "rows after the first sync" "$(postgres 'SELECT count(*) FROM bank_ro_test.fixture')" 2
check "F-1 after the first sync" "$(postgres "SELECT value FROM bank_ro_test.fixture WHERE id = 'F-1'")" v1

echo "== Step 2: F-1 = v2 and a new F-3 in Delta, then a refresh"
warehouse "UPDATE $SOURCE SET value = 'v2', updated_at = current_timestamp() WHERE id = 'F-1'"
warehouse "INSERT INTO $SOURCE VALUES ('F-3', 'v1', current_timestamp())"
START=$(date +%s)
databricks pipelines start-update "$(pipeline_id)" -p "$PROFILE" >/dev/null
sleep 10
wait_update
echo "Refresh took $(($(date +%s) - START)) s"
check "rows after the refresh" "$(postgres 'SELECT count(*) FROM bank_ro_test.fixture')" 3
check "F-1 after the refresh" "$(postgres "SELECT value FROM bank_ro_test.fixture WHERE id = 'F-1'")" v2
check "F-3 after the refresh" "$(postgres "SELECT count(*) FROM bank_ro_test.fixture WHERE id = 'F-3'")" 1

[[ $FAILED -eq 0 ]] && echo "== Freshness test passed" || { echo "== Freshness test FAILED"; exit 1; }
