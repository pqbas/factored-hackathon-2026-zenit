# Databricks notebook source
# MAGIC %md
# MAGIC # Gold: agent-facing and analytics tables
# MAGIC
# MAGIC | Table | Grain | Used by |
# MAGIC |---|---|---|
# MAGIC | `customer_360` | customer | agent context: profile, products, open cases, recent contact history |
# MAGIC | `customer_products` | product | agent tools: balances, limits, utilization, delinquency |
# MAGIC | `customer_transactions` | transaction | agent tools: movements / disputes (USD amount backfilled from daily rates) |
# MAGIC | `customer_cases` | complaint | agent tools: open PQR cases, SLA status |
# MAGIC | `interaction_history` | interaction | agent context + evaluation: contact reason, outcome, transcript, survey |
# MAGIC | `contact_reason_daily` | day x country x channel x reason | problem analysis: demand, FCR, escalation, sentiment |
# MAGIC
# MAGIC Relative windows ("last 90 days") are anchored to `as_of_date` = latest transaction date in the data, not
# MAGIC `current_date()`, because the dataset is a static snapshot (ends 2026-06-17).

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace")
catalog = dbutils.widgets.get("catalog")
spark.sql(f"USE CATALOG {catalog}")

as_of = spark.sql("SELECT to_date(max(transaction_date)) FROM bank_silver.transactions").first()[0]
print(f"as_of_date = {as_of}")


def sql(query: str):
    return spark.sql(query.replace("${bank.as_of}", str(as_of)))

# COMMAND ----------

sql("""
CREATE OR REPLACE TABLE bank_gold.customer_transactions AS
SELECT
  t.transaction_id, t.customer_id, t.product_id, p.product_type,
  t.transaction_date, t.process_date, t.transaction_type, t.transaction_category,
  t.amount, t.currency,
  coalesce(t.amount_usd, CASE WHEN t.currency = 'USD' THEN t.amount ELSE round(t.amount * r.exchange_rate, 2) END) AS amount_usd,
  t.amount_usd IS NULL AS amount_usd_is_derived,
  t.channel, t.branch_id, t.merchant_name, t.merchant_category,
  t.transaction_country, t.transaction_city, t.transaction_status, t.response_code,
  t.is_fraud, t.fraud_score
FROM bank_silver.transactions t
LEFT JOIN bank_silver.products p USING (product_id)
LEFT JOIN bank_silver.daily_exchange_rates r
  ON r.date = to_date(t.transaction_date) AND r.source_currency = t.currency AND r.target_currency = 'USD'
""")

sql("""
CREATE OR REPLACE TABLE bank_gold.customer_products AS
WITH rate AS (
  SELECT source_currency, exchange_rate FROM bank_silver.daily_exchange_rates
  WHERE target_currency = 'USD'
  QUALIFY row_number() OVER (PARTITION BY source_currency ORDER BY date DESC) = 1
)
SELECT
  p.product_id, p.customer_id, p.product_type, p.product_status, p.currency,
  right(p.product_number, 4) AS product_number_last4,
  p.current_balance, p.credit_limit,
  CASE WHEN p.currency = 'USD' THEN p.current_balance ELSE round(p.current_balance * rate.exchange_rate, 2) END AS current_balance_usd,
  CASE WHEN p.credit_limit > 0 THEN round(p.current_balance / p.credit_limit, 4) END AS credit_utilization,
  p.interest_rate, p.days_past_due, coalesce(p.days_past_due, 0) > 0 AS is_delinquent,
  p.opening_date, p.expiration_date, p.opening_channel, p.opening_branch_id, p.has_linked_app,
  p.last_transaction_date, p.last_updated
FROM bank_silver.products p
LEFT JOIN rate ON rate.source_currency = p.currency
""")

sql("""
CREATE OR REPLACE TABLE bank_gold.customer_cases AS
SELECT
  c.complaint_id, c.customer_id, c.creation_date, c.case_type, c.category, c.subcategory,
  c.reception_channel, c.affected_product_id, c.origin_interaction_id, c.description,
  c.claimed_amount, c.currency, c.priority, c.status,
  c.status IN ('Open', 'In Process', 'Escalated') AS is_open,
  c.assigned_agent_id, c.first_response_date, c.resolution_date, c.resolution_days, c.resolution,
  c.compensation_granted, c.sla_breached, c.is_repeat_complainer,
  datediff(coalesce(c.resolution_date, to_timestamp('${bank.as_of}')), c.creation_date) AS age_days
FROM bank_silver.complaints c
""")

sql("""
CREATE OR REPLACE TABLE bank_gold.interaction_history AS
WITH survey AS (
  SELECT interaction_id,
         max_by(main_score, survey_date) FILTER (WHERE survey_type = 'CSAT') AS csat,
         max_by(main_score, survey_date) FILTER (WHERE survey_type = 'NPS') AS nps,
         max_by(open_comments, survey_date) AS survey_comment
  FROM bank_silver.satisfaction_surveys
  WHERE interaction_id IS NOT NULL
  GROUP BY interaction_id
),
transcript AS (
  SELECT * FROM bank_silver.call_transcripts
  QUALIFY row_number() OVER (PARTITION BY interaction_id ORDER BY process_date DESC) = 1
)
SELECT
  i.interaction_id, i.customer_id, cu.country, cu.segment, i.agent_id,
  i.interaction_date, i.interaction_type, i.channel, i.contact_reason, i.reason_category,
  i.duration_seconds, i.wait_time_seconds, i.was_resolved, i.requires_followup, i.was_escalated,
  i.detected_sentiment, i.sentiment_score, i.customer_detected_accent, i.mentioned_products,
  t.transcript_id, t.full_text AS transcript, t.detected_intents, t.main_topics, t.detected_language,
  s.csat, s.nps, s.survey_comment
FROM bank_silver.call_center_interactions i
LEFT JOIN bank_silver.customers cu USING (customer_id)
LEFT JOIN transcript t USING (interaction_id)
LEFT JOIN survey s USING (interaction_id)
""")

sql("""
CREATE OR REPLACE TABLE bank_gold.customer_360 AS
WITH prod AS (
  SELECT customer_id,
         count(*) AS products_total,
         count_if(product_status = 'Active') AS products_active,
         collect_set(product_type) AS product_types,
         round(sum(CASE WHEN product_type NOT IN ('Credit Card', 'Personal Loan', 'Mortgage') THEN current_balance_usd END), 2) AS deposit_balance_usd,
         round(sum(CASE WHEN product_type IN ('Credit Card', 'Personal Loan', 'Mortgage') THEN current_balance_usd END), 2) AS credit_balance_usd,
         max(coalesce(days_past_due, 0)) AS max_days_past_due,
         count_if(product_status = 'Blocked') AS products_blocked
  FROM bank_gold.customer_products GROUP BY customer_id
),
tx AS (
  SELECT customer_id,
         count(*) AS tx_90d,
         round(sum(amount_usd), 2) AS tx_amount_usd_90d,
         count_if(transaction_status = 'Declined') AS tx_declined_90d,
         count_if(is_fraud) AS tx_fraud_90d,
         max(transaction_date) AS last_transaction_date
  FROM bank_gold.customer_transactions
  WHERE transaction_date >= date_sub(to_date('${bank.as_of}'), 90)
  GROUP BY customer_id
),
cases AS (
  SELECT customer_id,
         count_if(is_open) AS open_cases,
         count(*) AS cases_total,
         max(creation_date) AS last_case_date
  FROM bank_gold.customer_cases GROUP BY customer_id
),
contacts AS (
  SELECT customer_id,
         count_if(interaction_date >= date_sub(to_date('${bank.as_of}'), 90)) AS contacts_90d,
         max(interaction_date) AS last_contact_date,
         max_by(contact_reason, interaction_date) AS last_contact_reason,
         max_by(channel, interaction_date) AS last_contact_channel,
         mode(channel) AS preferred_channel,
         round(avg(sentiment_score) FILTER (WHERE interaction_date >= date_sub(to_date('${bank.as_of}'), 90)), 2) AS avg_sentiment_90d,
         round(avg(csat), 2) AS avg_csat,
         count_if(was_escalated) AS escalations_total
  FROM bank_gold.interaction_history GROUP BY customer_id
)
SELECT
  c.customer_id, c.first_name, c.last_name, c.document_type,
  right(c.document_number, 4) AS document_number_last4,
  c.country, c.city, c.state,
  CASE c.country WHEN 'Mexico' THEN 'MXN' WHEN 'Colombia' THEN 'COP' WHEN 'Argentina' THEN 'ARS' END AS local_currency,
  c.detected_accent, c.segment, c.customer_status, c.registration_date,
  floor(months_between(to_date('${bank.as_of}'), c.date_of_birth) / 12) AS age,
  c.credit_score, c.estimated_monthly_income, c.accepts_marketing,
  coalesce(prod.products_total, 0) AS products_total, coalesce(prod.products_active, 0) AS products_active,
  prod.product_types, prod.deposit_balance_usd, prod.credit_balance_usd,
  coalesce(prod.max_days_past_due, 0) AS max_days_past_due, coalesce(prod.products_blocked, 0) AS products_blocked,
  coalesce(tx.tx_90d, 0) AS tx_90d, tx.tx_amount_usd_90d, coalesce(tx.tx_declined_90d, 0) AS tx_declined_90d,
  coalesce(tx.tx_fraud_90d, 0) AS tx_fraud_90d, tx.last_transaction_date,
  coalesce(cases.open_cases, 0) AS open_cases, coalesce(cases.cases_total, 0) AS cases_total, cases.last_case_date,
  coalesce(contacts.contacts_90d, 0) AS contacts_90d, contacts.last_contact_date, contacts.last_contact_reason,
  contacts.last_contact_channel, contacts.preferred_channel, contacts.avg_sentiment_90d, contacts.avg_csat,
  coalesce(contacts.escalations_total, 0) AS escalations_total,
  to_date('${bank.as_of}') AS as_of_date
FROM bank_silver.customers c
LEFT JOIN prod USING (customer_id)
LEFT JOIN tx USING (customer_id)
LEFT JOIN cases USING (customer_id)
LEFT JOIN contacts USING (customer_id)
""")

sql("""
CREATE OR REPLACE TABLE bank_gold.contact_reason_daily AS
SELECT
  to_date(interaction_date) AS day, country, segment, channel, reason_category, contact_reason,
  count(*) AS interactions,
  round(avg(CASE WHEN was_resolved THEN 1.0 ELSE 0.0 END), 4) AS fcr_rate,
  round(avg(CASE WHEN was_escalated THEN 1.0 ELSE 0.0 END), 4) AS escalation_rate,
  round(avg(duration_seconds), 1) AS avg_handle_seconds,
  round(avg(wait_time_seconds), 1) AS avg_wait_seconds,
  round(avg(sentiment_score), 3) AS avg_sentiment,
  round(avg(csat), 2) AS avg_csat,
  count(csat) AS csat_responses
FROM bank_gold.interaction_history
GROUP BY ALL
""")

# COMMAND ----------

for t in ["customer_360", "customer_products", "customer_transactions", "customer_cases", "interaction_history", "contact_reason_daily"]:
    print(f"{t:24s} {spark.table(f'bank_gold.{t}').count():>12,d} rows")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Operational tables (written by the agent, never dropped by the pipeline)

# COMMAND ----------

spark.sql("CREATE SCHEMA IF NOT EXISTS bank_ops")
spark.sql("""
CREATE TABLE IF NOT EXISTS bank_ops.dispute_cases (
  case_id STRING NOT NULL COMMENT 'DSP-xxxxxxxxxx, generated by the agent',
  customer_id STRING NOT NULL COMMENT 'From the trusted session, never from chat text',
  transaction_id STRING COMMENT 'NULL when the customer was handed off before identifying the charge',
  created_at TIMESTAMP NOT NULL,
  status STRING NOT NULL COMMENT 'Open | Escalated',
  route STRING NOT NULL COMMENT 'AUTO | HUMAN',
  amount DECIMAL(15,2),
  currency STRING,
  amount_usd DECIMAL(15,2),
  customer_reason STRING COMMENT 'Customer messages that described the charge',
  policy_rules STRING COMMENT 'JSON list of policy rule ids that fired',
  handoff_json STRING COMMENT 'Handoff packet for the human agent (JSON)',
  language STRING,
  thread_id STRING
) COMMENT 'Dispute cases created by the bank-assistant agent'
""")
