-- Demo sessions of the daily traffic simulation (scripts/simulate/), in the
-- Lakebase instance, apart from bank_ro (read-only copies) and ai_chatbot
-- (chats). One row per simulated customer and day: a random token (sim-…)
-- that expires at the end of that day. Only the instance owner (the script)
-- writes; the agent and the back only read, with a fixed query by token.
-- Idempotent.
\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS bank_sessions;

CREATE TABLE IF NOT EXISTS bank_sessions.sim_sessions (
  token text PRIMARY KEY CHECK (token LIKE 'sim-%'),
  customer_id text NOT NULL,
  country text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  day date NOT NULL
);
-- The simulation never repeats a customer across days.
CREATE INDEX IF NOT EXISTS sim_sessions_customer ON bank_sessions.sim_sessions (customer_id);

GRANT USAGE ON SCHEMA bank_sessions
  TO "3dbf24a7-2841-4cb8-b968-7ce309a84dde", -- agent
     "046fa618-1a31-4129-b699-4c2bef67dbb7"; -- back
GRANT SELECT ON bank_sessions.sim_sessions
  TO "3dbf24a7-2841-4cb8-b968-7ce309a84dde",
     "046fa618-1a31-4129-b699-4c2bef67dbb7";

SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'bank_sessions' AND table_name = 'sim_sessions'
ORDER BY grantee;
