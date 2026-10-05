#!/usr/bin/env bash
# The evaluation's own back: :3300, its own database (chatbot_eval in the
# back-test-pg container) and the local agent on :8001. Its conversations
# stay out of the console of chatbot_dev (:3200), and --fresh starts the
# database empty. Runs in the foreground; stop it with Ctrl+C.
#
#   scripts/eval/start-eval-back.sh [--fresh]
#
# Needs DATABRICKS_CONFIG_PROFILE and DATABRICKS_WAREHOUSE_ID (from the
# environment or back/.env) for the customer data, and the agent running with
# the demo tokens of scripts/eval/README.md in its DEMO_SESSIONS_JSON.
set -euo pipefail

BACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$BACK_DIR"

DB_NAME=chatbot_eval
DB_CONTAINER=back-test-pg
PORT=3300

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

# The evaluation only talks to a local agent: it never spends prod's.
API_PROXY="${EVAL_API_PROXY:-http://localhost:8001/invocations}"
if [[ ! "$API_PROXY" =~ ^http://(localhost|127\.0\.0\.1)(:[0-9]+)?(/|$) ]]; then
  echo "Refusing API_PROXY=$API_PROXY: the evaluation back only uses a local agent." >&2
  exit 1
fi
: "${DATABRICKS_WAREHOUSE_ID:?Set DATABRICKS_WAREHOUSE_ID (environment or back/.env)}"

FRESH=0
[[ "${1:-}" == "--fresh" ]] && FRESH=1

psql_pg() { docker exec "$DB_CONTAINER" psql -U postgres -tAc "$1"; }
if [[ $FRESH -eq 1 ]]; then
  docker exec "$DB_CONTAINER" dropdb -U postgres --if-exists --force "$DB_NAME"
fi
if [[ "$(psql_pg "select 1 from pg_database where datname = '$DB_NAME'")" != "1" ]]; then
  docker exec "$DB_CONTAINER" createdb -U postgres "$DB_NAME"
fi

export POSTGRES_URL="postgresql://postgres:postgres@127.0.0.1:55432/$DB_NAME"
npm run db:migrate
npm run build:server

# The 13 demo customers (Basic, Plus, Premium and Student, in MX, CO and AR),
# the expired session (#37) and Santiago again for the failing tool (#40).
# demo-tool-down goes last: the console maps a customer id to its first live
# token.
DEMO_CUSTOMERS_JSON='[
  {"token":"demo-mx-1","label":"Santiago · México","customerId":"CLI-FLEUCGTWGAHL"},
  {"token":"demo-co-1","label":"Javier · Colombia","customerId":"CLI-7MPS3ZOPSN4Q"},
  {"token":"demo-ar-1","label":"Daniela · Argentina","customerId":"CLI-714PN0OOE0WX"},
  {"token":"demo-mx-2","label":"Eduardo · México","customerId":"CLI-0IY07CEBUL79"},
  {"token":"demo-mx-3","label":"Fernando · México","customerId":"CLI-OAZTV7GG5M0D"},
  {"token":"demo-co-2","label":"Gustavo · Colombia","customerId":"CLI-TVX8Q10GJDTW"},
  {"token":"demo-ar-2","label":"Adriana · Argentina","customerId":"CLI-2MM9EXMOO8KD"},
  {"token":"demo-mx-4","label":"Victoria · México","customerId":"CLI-01OSDSMM4FX2"},
  {"token":"demo-co-3","label":"Pilar · Colombia","customerId":"CLI-JLLEM8RQT11E"},
  {"token":"demo-ar-3","label":"Antonio · Argentina","customerId":"CLI-MO9NTQLU8K63"},
  {"token":"demo-ar-4","label":"Marco · Argentina","customerId":"CLI-BTHO9TGJDB68"},
  {"token":"demo-mx-5","label":"Natalia · México","customerId":"CLI-MA350GCK64W1"},
  {"token":"demo-co-4","label":"Leonardo · Colombia","customerId":"CLI-2UJ5P5LESPCJ"},
  {"token":"demo-expired","label":"Sesión vencida","customerId":"CLI-FLEUCGTWGAHL","expired":true},
  {"token":"demo-tool-down","label":"Herramienta caída","customerId":"CLI-FLEUCGTWGAHL"}
]'
export DEMO_CUSTOMERS_JSON API_PROXY
export ADMIN_EMAILS="${ADMIN_EMAILS:-pcubasm1@gmail.com}"
export ADVISOR_EMAILS="${ADVISOR_EMAILS:-asesor1@example.com,asesor2@example.com}"
export UC_CATALOG="${UC_CATALOG:-workspace}"
export CHAT_APP_PORT="$PORT"

echo "Eval back on :$PORT, database $DB_NAME, agent $API_PROXY"
cd server
exec env NODE_ENV=production node dist/index.mjs
