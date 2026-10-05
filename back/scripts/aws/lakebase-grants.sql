-- Lakebase access of the AWS deployment's service principals: the back's
-- (bank-assistant-aws) and the agent's (bank-assistant-aws-agent).
-- Idempotent. Run as a member of databricks_superuser:
--   psql "host=$PGHOST dbname=databricks_postgres user=<you> sslmode=require" \
--     -v ON_ERROR_STOP=1 -f scripts/aws/lakebase-grants.sql
-- It reads and writes the conversations (ai_chatbot) like the UI app's
-- principal, and only reads the bank's data (bank_ro) and the simulation's
-- sessions (bank_sessions). It gets nothing on the migrations' schema
-- (drizzle): the AWS deployment runs none.
-- Run it again after a migration that adds a table to ai_chatbot: the tables
-- belong to the UI app's principal, so default privileges can't be set here.

CREATE EXTENSION IF NOT EXISTS databricks_auth;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cc0d82f4-6c8d-4311-bbd2-8a603d1d1073') THEN
    PERFORM databricks_create_role('cc0d82f4-6c8d-4311-bbd2-8a603d1d1073', 'SERVICE_PRINCIPAL');
  END IF;
END $$;

GRANT USAGE ON SCHEMA ai_chatbot TO "cc0d82f4-6c8d-4311-bbd2-8a603d1d1073";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ai_chatbot
  TO "cc0d82f4-6c8d-4311-bbd2-8a603d1d1073";

GRANT USAGE ON SCHEMA bank_ro TO "cc0d82f4-6c8d-4311-bbd2-8a603d1d1073";
GRANT SELECT ON bank_ro.customer_products, bank_ro.customer_transactions,
  bank_ro.customer_cases, bank_ro.customer_360, bank_ro.interaction_history,
  bank_ro.customers, bank_ro.call_transcripts
  TO "cc0d82f4-6c8d-4311-bbd2-8a603d1d1073";

GRANT USAGE ON SCHEMA bank_sessions TO "cc0d82f4-6c8d-4311-bbd2-8a603d1d1073";
GRANT SELECT ON bank_sessions.sim_sessions TO "cc0d82f4-6c8d-4311-bbd2-8a603d1d1073";

-- The agent on AWS (bank-assistant-aws-agent): least privilege, like the
-- agent App's principal. It only reads the three tables its tools query and
-- the simulation's sessions: nothing in ai_chatbot, nothing with personal data.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '68c1a49e-ede0-4e89-be13-bf054b68b713') THEN
    PERFORM databricks_create_role('68c1a49e-ede0-4e89-be13-bf054b68b713', 'SERVICE_PRINCIPAL');
  END IF;
END $$;

GRANT USAGE ON SCHEMA bank_ro TO "68c1a49e-ede0-4e89-be13-bf054b68b713";
GRANT SELECT ON bank_ro.customer_products, bank_ro.customer_transactions,
  bank_ro.customer_cases
  TO "68c1a49e-ede0-4e89-be13-bf054b68b713";

GRANT USAGE ON SCHEMA bank_sessions TO "68c1a49e-ede0-4e89-be13-bf054b68b713";
GRANT SELECT ON bank_sessions.sim_sessions TO "68c1a49e-ede0-4e89-be13-bf054b68b713";

-- What each principal can do, for the log.
SELECT grantee, table_schema, table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE grantee IN ('cc0d82f4-6c8d-4311-bbd2-8a603d1d1073',
                  '68c1a49e-ede0-4e89-be13-bf054b68b713')
GROUP BY grantee, table_schema, table_name
ORDER BY grantee, table_schema, table_name;
