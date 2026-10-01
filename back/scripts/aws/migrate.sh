#!/bin/bash
# Applies the pending migrations to the shared Lakebase database. The AWS
# deployment is the only active one, so this is the explicit migration step:
# run it BEFORE deploy.sh when a commit brings a new migration.
#   migrate.sh           shows what is pending and whether you may apply it
#   migrate.sh --apply   applies the pending migrations
# It runs as YOU (the Databricks CLI profile), never as a service principal
# of the apps: the back's principal has no DDL and the agent's only reads.
# You need to own the tables, see "Migrations" in README.md.
set -euo pipefail
cd "$(dirname "$0")/../.."

export DATABRICKS_CONFIG_PROFILE=${DATABRICKS_CONFIG_PROFILE:-DEFAULT}
INSTANCE=${LAKEBASE_INSTANCE:-bank-assistant-chat-db}
PGHOST=$(databricks database get-database-instance "$INSTANCE" -o json | jq -r .read_write_dns)
PGUSER=$(databricks current-user me -o json | jq -r .userName)
export PGHOST PGUSER PGDATABASE=databricks_postgres PGPORT=5432 PGSSLMODE=require
# Nothing of a local .env may redirect the migration.
unset POSTGRES_URL

check=$(npx tsx scripts/aws/migrate-check.ts | tail -1)
echo "$check" | jq -r '"Database: \(env.PGHOST)\nIdentity: \(.user)\nMigrations: \(.applied) applied, \(.inRepo) in the repo, \(.pending) pending"'
pending=$(jq -r .pending <<<"$check")
not_owned=$(jq -r '.notOwned | length' <<<"$check")

if [ "$pending" -lt 0 ]; then
  echo "The database is ahead of this commit: check out a newer one." >&2
  exit 1
fi
if [ "$not_owned" -gt 0 ]; then
  echo "This identity does not own $not_owned tables, so it cannot alter them:"
  jq -r '.notOwned[] | "  " + .' <<<"$check"
fi
if [ "$pending" -eq 0 ]; then
  echo "Nothing to apply."
  exit 0
fi
if [ "${1:-}" != "--apply" ]; then
  echo "Run again with --apply to apply them."
  exit 0
fi
if [ "$not_owned" -gt 0 ]; then
  echo "Not applying: take ownership first (README.md, Migrations)." >&2
  exit 1
fi

npm run db:migrate
echo "New tables need their grants: run scripts/aws/lakebase-grants.sql."
