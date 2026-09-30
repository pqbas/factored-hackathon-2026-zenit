-- Fixture of the bank's read-only schema, for the tests (never Lakebase).
--
-- Same table names and columns as the synced tables of the bank_gold /
-- bank_silver Delta tables (see spec/29-09-26-datos-banco-lakebase), with the
-- Postgres types the Databricks sync gives them: STRING text, DECIMAL numeric,
-- TIMESTAMP timestamptz, DATE date, INT integer, BOOLEAN boolean,
-- ARRAY<STRING> jsonb. The PKs are the ones of the synced tables.
-- Idempotent: it drops and recreates the schema.
--
-- Customers:
--   CLI-FLEUCGTWGAHL (Santiago, demo-mx-1): an active card, plus a closed
--     savings account and an active loan (both must be left out), one
--     movement per product, two interactions (one with transcript), one case.
--   CLI-7MPS3ZOPSN4Q (Javier, demo-co-1): an active card, an active savings
--     account, a closed card, 12 movements (only 10 come back), and a second
--     customer sharing his card's product_id (the join must match customer_id).
--   CLI-PROFILE-FAILS: as Santiago, but reading his contact data fails (see
--     the customers view below).
--   CLI-EMPTY: in customer_360 and nothing else.
DROP SCHEMA IF EXISTS bank_ro CASCADE;
CREATE SCHEMA bank_ro;

CREATE TABLE bank_ro.customer_products (
  product_id text NOT NULL,
  customer_id text NOT NULL,
  product_type text,
  is_credit_product boolean,
  product_status text,
  currency text,
  product_number_last4 text,
  current_balance numeric(15,2),
  credit_limit numeric(15,2),
  current_balance_usd numeric(18,2),
  credit_utilization numeric(9,4),
  interest_rate numeric(5,2),
  days_past_due integer,
  is_delinquent boolean,
  opening_date date,
  expiration_date date,
  opening_channel text,
  opening_branch_id text,
  has_linked_app boolean,
  last_transaction_date timestamptz,
  last_updated timestamptz,
  PRIMARY KEY (customer_id, product_id)
);

CREATE TABLE bank_ro.customer_transactions (
  transaction_id text NOT NULL,
  customer_id text NOT NULL,
  product_id text,
  product_type text,
  transaction_date timestamptz,
  process_date date,
  transaction_type text,
  transaction_category text,
  amount numeric(15,2),
  currency text,
  amount_usd numeric(15,2),
  amount_usd_is_derived boolean,
  channel text,
  branch_id text,
  merchant_name text,
  merchant_category text,
  transaction_country text,
  transaction_city text,
  transaction_status text,
  response_code text,
  is_fraud boolean,
  fraud_score numeric(5,2),
  PRIMARY KEY (customer_id, transaction_id)
);

CREATE TABLE bank_ro.customer_cases (
  complaint_id text NOT NULL,
  customer_id text NOT NULL,
  creation_date timestamptz,
  case_type text,
  category text,
  subcategory text,
  reception_channel text,
  affected_product_id text,
  origin_interaction_id text,
  description text,
  claimed_amount numeric(15,2),
  currency text,
  priority text,
  status text,
  is_open boolean,
  assigned_agent_id text,
  first_response_date timestamptz,
  resolution_date timestamptz,
  resolution_days integer,
  resolution text,
  compensation_granted numeric(15,2),
  sla_breached boolean,
  is_repeat_complainer boolean,
  age_days integer,
  PRIMARY KEY (customer_id, complaint_id)
);

CREATE TABLE bank_ro.customer_360 (
  customer_id text NOT NULL PRIMARY KEY,
  first_name text,
  last_name text,
  document_type text,
  document_number_last4 text,
  country text,
  city text,
  state text,
  primary_currency text,
  detected_accent text,
  segment text,
  customer_status text,
  registration_date timestamptz,
  age integer,
  credit_score integer,
  estimated_monthly_income numeric(12,2),
  accepts_marketing boolean,
  products_total integer,
  products_active integer,
  product_types jsonb,
  deposit_balance_usd numeric(18,2),
  credit_balance_usd numeric(18,2),
  max_days_past_due integer,
  products_blocked integer,
  tx_90d integer,
  tx_amount_usd_90d numeric(18,2),
  tx_declined_90d integer,
  tx_fraud_90d integer,
  last_transaction_date timestamptz,
  open_cases integer,
  cases_total integer,
  last_case_date timestamptz,
  contacts_90d integer,
  last_contact_date timestamptz,
  last_contact_reason text,
  last_contact_channel text,
  preferred_channel text,
  avg_sentiment_90d numeric(5,2),
  avg_csat numeric(5,2),
  escalations_total integer,
  as_of_date date
);

CREATE TABLE bank_ro.interaction_history (
  interaction_id text NOT NULL,
  customer_id text NOT NULL,
  country text,
  segment text,
  agent_id text,
  interaction_date timestamptz,
  interaction_type text,
  channel text,
  contact_reason text,
  reason_category text,
  duration_seconds integer,
  wait_time_seconds integer,
  was_resolved boolean,
  requires_followup boolean,
  was_escalated boolean,
  detected_sentiment text,
  sentiment_score numeric(3,2),
  customer_detected_accent text,
  mentioned_products text,
  transcript_id text,
  transcript text,
  detected_intents text,
  main_topics text,
  detected_language text,
  csat integer,
  nps integer,
  survey_comment text,
  PRIMARY KEY (customer_id, interaction_id)
);

-- The rows live in customers_rows and `customers` is a view over them, so a
-- fixture customer can make the profile query fail: reading the email of
-- CLI-PROFILE-FAILS raises (division by zero) at query time, like a missing
-- grant on bank_silver.customers would. Nothing else reads the view for that
-- customer's name (that is customer_360).
CREATE TABLE bank_ro.customers_rows (
  customer_id text NOT NULL PRIMARY KEY,
  document_number text,
  document_type text,
  first_name text,
  last_name text,
  date_of_birth date,
  gender text,
  email text,
  mobile_phone text,
  landline_phone text,
  address text,
  city text,
  state text,
  country text,
  postal_code text,
  detected_accent text,
  segment text,
  credit_score integer,
  estimated_monthly_income numeric(12,2),
  occupation text,
  marital_status text,
  education_level text,
  registration_date timestamptz,
  registration_branch_id text,
  customer_status text,
  last_updated timestamptz,
  accepts_marketing boolean,
  _source_file text,
  _ingested_at timestamptz
);

CREATE VIEW bank_ro.customers AS
SELECT
  customer_id, document_number, document_type, first_name, last_name,
  date_of_birth, gender,
  CASE WHEN customer_id = 'CLI-PROFILE-FAILS'
    THEN (1 / (length(customer_id) - length(customer_id)))::text
    ELSE email
  END AS email,
  mobile_phone, landline_phone, address, city, state, country, postal_code,
  detected_accent, segment, credit_score, estimated_monthly_income,
  occupation, marital_status, education_level, registration_date,
  registration_branch_id, customer_status, last_updated, accepts_marketing,
  _source_file, _ingested_at
FROM bank_ro.customers_rows;

CREATE TABLE bank_ro.call_transcripts (
  transcript_id text NOT NULL,
  interaction_id text,
  process_date date,
  customer_id text NOT NULL,
  agent_id text,
  full_text text,
  customer_text text,
  agent_text text,
  detected_language text,
  detected_accent text,
  accent_confidence numeric(3,2),
  detected_keywords text,
  mentioned_entities text,
  detected_intents text,
  main_topics text,
  transcription_model text,
  audio_quality text,
  duration_seconds integer,
  _source_file text,
  _ingested_at timestamptz,
  PRIMARY KEY (customer_id, transcript_id)
);

-- customer_360 (names and the console's "Datos del cliente")
INSERT INTO bank_ro.customer_360
  (customer_id, first_name, last_name, country, city, segment, customer_status, registration_date, preferred_channel)
VALUES
  ('CLI-FLEUCGTWGAHL', 'Santiago', 'Contreras López', 'México', 'Tijuana', 'Plus', 'Active', '2022-07-03T18:46:46Z', 'Phone'),
  ('CLI-PROFILE-FAILS', 'Santiago', 'Contreras López', 'México', 'Tijuana', 'Plus', 'Active', '2022-07-03T18:46:46Z', 'Phone'),
  ('CLI-7MPS3ZOPSN4Q', 'Javier', 'Ortiz Vega', 'Colombia', 'Bogotá', 'Standard', 'Active', '2021-02-10T12:00:00Z', 'App'),
  ('CLI-EMPTY', 'Ana', 'Sin Datos', 'Perú', 'Lima', 'Standard', 'Active', '2023-01-15T09:30:00Z', 'Phone');

-- customers: mobile_phone '' is a blank the back turns into null
INSERT INTO bank_ro.customers_rows
  (customer_id, first_name, last_name, email, mobile_phone)
VALUES
  ('CLI-FLEUCGTWGAHL', 'Santiago', 'Contreras López', 'santiago.contreras357@gmail.com', ''),
  ('CLI-PROFILE-FAILS', 'Santiago', 'Contreras López', 'santiago.fails@example.com', ''),
  ('CLI-7MPS3ZOPSN4Q', 'Javier', 'Ortiz Vega', 'javier.ortiz@example.com', '+57 300 000 0000');

-- Products
INSERT INTO bank_ro.customer_products
  (product_id, customer_id, product_type, product_status, currency, product_number_last4, current_balance, credit_limit)
VALUES
  ('PRD-S-CARD', 'CLI-FLEUCGTWGAHL', 'Tarjeta Crédito', 'Active', 'USD', '1070', 3332.62, 8672.72),
  ('PRD-S-SAV', 'CLI-FLEUCGTWGAHL', 'Cuenta Ahorro', 'Closed', 'USD', '2222', 10.00, NULL),
  ('PRD-S-LOAN', 'CLI-FLEUCGTWGAHL', 'Préstamo Personal', 'Active', 'USD', '3333', 5000.00, 5000.00),
  ('PRD-J-CARD', 'CLI-7MPS3ZOPSN4Q', 'Tarjeta Crédito', 'Active', 'COP', '3001', 1200.00, 5000.00),
  ('PRD-J-SAV', 'CLI-7MPS3ZOPSN4Q', 'Cuenta Ahorro', 'Active', 'COP', '5002', 900.50, NULL),
  ('PRD-J-OLD', 'CLI-7MPS3ZOPSN4Q', 'Tarjeta Crédito', 'Closed', 'COP', '9999', 0.00, 1000.00),
  -- another customer with the same product_id as Javier's card
  ('PRD-J-CARD', 'CLI-OTHER', 'Cuenta Ahorro', 'Active', 'COP', '7777', 1.00, NULL);

-- Movements
INSERT INTO bank_ro.customer_transactions
  (transaction_id, customer_id, product_id, transaction_date, transaction_type, merchant_name, amount, currency, transaction_status)
VALUES
  ('TX-S-1', 'CLI-FLEUCGTWGAHL', 'PRD-S-CARD', '2026-06-08T15:00:51Z', 'Purchase', 'Internet Plus', 329.44, 'USD', 'Approved'),
  ('TX-S-2', 'CLI-FLEUCGTWGAHL', 'PRD-S-SAV', '2026-06-09T10:00:00Z', 'Deposit', 'Closed account', 5.00, 'USD', 'Approved'),
  ('TX-S-3', 'CLI-FLEUCGTWGAHL', 'PRD-S-LOAN', '2026-06-09T11:00:00Z', 'Payment', 'Loan', 100.00, 'USD', 'Approved');
-- 12 movements of Javier, alternating card and savings, one hour apart.
INSERT INTO bank_ro.customer_transactions
  (transaction_id, customer_id, product_id, transaction_date, transaction_type, merchant_name, amount, currency, transaction_status)
SELECT
  'TX-J-' || i, 'CLI-7MPS3ZOPSN4Q',
  CASE WHEN i % 2 = 0 THEN 'PRD-J-CARD' ELSE 'PRD-J-SAV' END,
  '2026-06-01T00:00:00Z'::timestamptz + (i || ' hours')::interval,
  'Purchase', 'Shop ' || i, i * 10, 'COP', 'Approved'
FROM generate_series(1, 12) AS i;

-- Interactions and their transcript (Santiago's first one has it)
INSERT INTO bank_ro.interaction_history
  (interaction_id, customer_id, interaction_date, interaction_type, channel, contact_reason, was_resolved, was_escalated, detected_sentiment, transcript_id)
VALUES
  ('INT-1', 'CLI-FLEUCGTWGAHL', '2026-04-23T06:01:09Z', 'Inbound Call', 'Phone', 'Transaccional', true, false, 'Neutral', 'TRS-1'),
  ('INT-2', 'CLI-FLEUCGTWGAHL', '2026-04-04T04:02:46Z', 'Outbound Call', 'Phone', 'Transaccional', true, false, 'Neutral', NULL),
  ('INT-F1', 'CLI-PROFILE-FAILS', '2026-04-23T06:01:09Z', 'Inbound Call', 'Phone', 'Transaccional', true, false, 'Neutral', NULL);

INSERT INTO bank_ro.call_transcripts
  (transcript_id, interaction_id, process_date, customer_id, customer_text, agent_text, detected_language, detected_intents, main_topics)
VALUES
  ('TRS-1', 'INT-1', '2026-04-22', 'CLI-FLEUCGTWGAHL',
   'Mi tarjeta es 4111 1111 1111 1111 y el cvv 123', 'Gracias, ya lo reviso.',
   'es', 'consulta_general', 'Queja');

-- Cases
INSERT INTO bank_ro.customer_cases
  (complaint_id, customer_id, creation_date, case_type, category, claimed_amount, currency, priority, status, resolution)
VALUES
  ('CAS-1', 'CLI-FLEUCGTWGAHL', '2026-03-01T10:00:00Z', 'Reclamo', 'Cobro indebido', 120.50, 'USD', 'Alta', 'Cerrado', 'Reembolso'),
  ('CAS-F1', 'CLI-PROFILE-FAILS', '2026-03-01T10:00:00Z', 'Reclamo', 'Cobro indebido', 120.50, 'USD', 'Alta', 'Cerrado', 'Reembolso');

-- Simulation sessions (scripts/simulate/sessions.sql, without grants): one
-- live session and one expired, both of Javier.
DROP SCHEMA IF EXISTS bank_sessions CASCADE;
CREATE SCHEMA bank_sessions;

CREATE TABLE bank_sessions.sim_sessions (
  token text PRIMARY KEY CHECK (token LIKE 'sim-%'),
  customer_id text NOT NULL,
  country text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  day date NOT NULL
);
CREATE INDEX sim_sessions_customer ON bank_sessions.sim_sessions (customer_id);

INSERT INTO bank_sessions.sim_sessions (token, customer_id, country, expires_at, day)
VALUES
  ('sim-live-0001', 'CLI-7MPS3ZOPSN4Q', 'Colombia', '2099-01-01T00:00:00Z', '2098-12-31'),
  ('sim-expired-0001', 'CLI-7MPS3ZOPSN4Q', 'Colombia', '2020-01-01T00:00:00Z', '2019-12-31');
