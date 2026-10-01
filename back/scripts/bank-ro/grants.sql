-- Read-only access to the bank_ro synced tables (docs/datos-banco-lakebase.md).
-- Idempotent: setup.sh runs it after creating the tables and after every
-- refresh. Each role gets USAGE on bank_ro and SELECT on its tables, nothing
-- else. The agent never gets the tables with personal data.
\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS databricks_auth;

-- The agent App's service principal; the back App's role is created by its
-- `database` resource (databricks.yml), but is created here too if missing.
DO $$
DECLARE sp text;
BEGIN
  FOREACH sp IN ARRAY ARRAY[
    '3dbf24a7-2841-4cb8-b968-7ce309a84dde', -- agent (dev-bank-assistant-agent)
    '046fa618-1a31-4129-b699-4c2bef67dbb7', -- back (dev-bank-assistant-ui)
    'cc0d82f4-6c8d-4311-bbd2-8a603d1d1073'  -- back on AWS (bank-assistant-aws)
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = sp) THEN
      PERFORM databricks_create_role(sp, 'SERVICE_PRINCIPAL');
    END IF;
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA bank_ro TO "3dbf24a7-2841-4cb8-b968-7ce309a84dde";
GRANT SELECT ON bank_ro.customer_products, bank_ro.customer_transactions,
  bank_ro.customer_cases
  TO "3dbf24a7-2841-4cb8-b968-7ce309a84dde";

GRANT USAGE ON SCHEMA bank_ro TO "046fa618-1a31-4129-b699-4c2bef67dbb7";
GRANT SELECT ON bank_ro.customer_products, bank_ro.customer_transactions,
  bank_ro.customer_cases, bank_ro.customer_360, bank_ro.interaction_history,
  bank_ro.customers, bank_ro.call_transcripts
  TO "046fa618-1a31-4129-b699-4c2bef67dbb7";

-- The back on AWS reads what the back App reads (scripts/aws/lakebase-grants.sql).
GRANT USAGE ON SCHEMA bank_ro TO "cc0d82f4-6c8d-4311-bbd2-8a603d1d1073";
GRANT SELECT ON bank_ro.customer_products, bank_ro.customer_transactions,
  bank_ro.customer_cases, bank_ro.customer_360, bank_ro.interaction_history,
  bank_ro.customers, bank_ro.call_transcripts
  TO "cc0d82f4-6c8d-4311-bbd2-8a603d1d1073";

-- What each service principal can do in bank_ro, for the log.
SELECT grantee, table_name, string_agg(privilege_type, ', ') AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'bank_ro'
  AND grantee IN ('3dbf24a7-2841-4cb8-b968-7ce309a84dde',
                  '046fa618-1a31-4129-b699-4c2bef67dbb7',
                  'cc0d82f4-6c8d-4311-bbd2-8a603d1d1073')
GROUP BY grantee, table_name
ORDER BY grantee, table_name;
