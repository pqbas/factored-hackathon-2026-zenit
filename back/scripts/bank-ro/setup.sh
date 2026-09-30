#!/usr/bin/env bash
# Applies grants.sql to the Lakebase instance as the CLI user (the instance's
# owner), through psql in the back-test-pg container. Idempotent: refresh.sh
# runs it after every refresh.
#
#   scripts/bank-ro/setup.sh [profile]
set -euo pipefail

PROFILE="${1:-DEFAULT}"
INSTANCE=bank-assistant-chat-db
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

HOST=$(databricks database get-database-instance "$INSTANCE" -p "$PROFILE" -o json |
  jq -r '.read_write_dns')
USER_NAME=$(databricks current-user me -p "$PROFILE" -o json | jq -r '.userName')
TOKEN=$(databricks database generate-database-credential -p "$PROFILE" -o json \
  --json "{\"instance_names\":[\"$INSTANCE\"],\"request_id\":\"$(uuidgen)\"}" |
  jq -r '.token')

docker exec -i -e PGPASSWORD="$TOKEN" back-test-pg psql -X \
  "host=$HOST dbname=databricks_postgres user=$USER_NAME sslmode=require" \
  <"$HERE/grants.sql"
