#!/usr/bin/env bash
# Unity Catalog grants the UI app's service principal needs on the bank data.
# Run at deploy time, as a workspace admin:
#   scripts/uc-grants.sh <sp-application-id> [cli-profile] [warehouse-id]
# The SP id is the app's service_principal_client_id
# (`databricks apps get dev-bank-assistant-ui`). Grants are idempotent.
set -euo pipefail

SP="${1:?usage: scripts/uc-grants.sh <sp-application-id> [cli-profile] [warehouse-id]}"
PROFILE="${2:-DEFAULT}"
WAREHOUSE="${3:-07ca55766c9c5097}"
CATALOG="${UC_CATALOG:-workspace}"

GRANTS=(
  "GRANT USE CATALOG ON CATALOG ${CATALOG} TO \`${SP}\`"
  "GRANT USE SCHEMA, SELECT ON SCHEMA ${CATALOG}.bank_gold TO \`${SP}\`"
  "GRANT USE SCHEMA, EXECUTE ON SCHEMA ${CATALOG}.bank_uc_consultas TO \`${SP}\`"
  "GRANT USE SCHEMA ON SCHEMA ${CATALOG}.bank_silver TO \`${SP}\`"
  "GRANT SELECT ON TABLE ${CATALOG}.bank_silver.call_transcripts TO \`${SP}\`"
  # Contact data for the console's "Datos del cliente".
  "GRANT SELECT ON TABLE ${CATALOG}.bank_silver.customers TO \`${SP}\`"
)

for statement in "${GRANTS[@]}"; do
  body=$(python3 -c 'import json,sys; print(json.dumps({"warehouse_id": sys.argv[1], "statement": sys.argv[2], "wait_timeout": "50s"}))' "$WAREHOUSE" "$statement")
  state=$(databricks api post /api/2.0/sql/statements -p "$PROFILE" --json "$body" \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); s=d["status"]; print(s["state"], s.get("error", {}).get("message", ""))')
  echo "${state}  ${statement}"
done
