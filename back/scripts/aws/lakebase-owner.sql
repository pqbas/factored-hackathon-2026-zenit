-- One-time transfer of the conversations' tables to a shared owner role, so
-- that migrations no longer depend on the Databricks App being on.
--
-- The tables of ai_chatbot and drizzle belong to the UI app's service
-- principal (046fa618-...), the one that ran the migrations on every
-- Databricks deploy. Only a table's owner can alter it, so this file must be
-- run ONCE AS THAT PRINCIPAL (a temporary OAuth secret of it, deleted
-- afterwards). Nobody else can do it, databricks_superuser included.
--
-- After it:
--   - bank_assistant_owner (no login) owns the schemas and the tables;
--   - the UI app's principal is a member, so a Databricks deploy still works;
--   - the person who migrates is a member (scripts/aws/migrate.sh runs as
--     them). The service principals of the AWS apps are NOT members: the
--     back's has no DDL and the agent's only reads bank_ro.
-- Replace :migrator with that person's Postgres role (their email):
--   psql ... -v ON_ERROR_STOP=1 -v migrator='someone@example.com' -f scripts/aws/lakebase-owner.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bank_assistant_owner') THEN
    CREATE ROLE bank_assistant_owner NOLOGIN;
  END IF;
END $$;

GRANT bank_assistant_owner TO "046fa618-1a31-4129-b699-4c2bef67dbb7";
GRANT bank_assistant_owner TO :"migrator";

-- The owner role needs CREATE on the database to keep creating schemas.
DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT n.nspname, c.relname, c.relkind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('ai_chatbot', 'drizzle') AND c.relkind IN ('r', 'S')
      -- A serial's sequence follows its table.
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'a')
  LOOP
    EXECUTE format('ALTER %s %I.%I OWNER TO bank_assistant_owner',
      CASE item.relkind WHEN 'S' THEN 'SEQUENCE' ELSE 'TABLE' END,
      item.nspname, item.relname);
  END LOOP;
END $$;

ALTER SCHEMA ai_chatbot OWNER TO bank_assistant_owner;
ALTER SCHEMA drizzle OWNER TO bank_assistant_owner;

-- The enum types of the schema, if any, move too.
DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT n.nspname, t.typname
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'ai_chatbot' AND t.typtype = 'e'
  LOOP
    EXECUTE format('ALTER TYPE %I.%I OWNER TO bank_assistant_owner', item.nspname, item.typname);
  END LOOP;
END $$;

SELECT n.nspname AS schema, c.relname AS name, pg_get_userbyid(c.relowner) AS owner
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('ai_chatbot', 'drizzle') AND c.relkind IN ('r', 'S')
ORDER BY 1, 2;
