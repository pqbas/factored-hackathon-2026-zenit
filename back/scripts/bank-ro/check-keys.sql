-- Run once on the SQL warehouse before creating the synced tables: a synced
-- table needs a unique primary key. Every row must show rows = keys.
SELECT 'customer_products' AS source, count(*) AS rows, count(DISTINCT customer_id, product_id) AS keys FROM workspace.bank_gold.customer_products
UNION ALL SELECT 'customer_transactions', count(*), count(DISTINCT customer_id, transaction_id) FROM workspace.bank_gold.customer_transactions
UNION ALL SELECT 'customer_cases', count(*), count(DISTINCT customer_id, complaint_id) FROM workspace.bank_gold.customer_cases
UNION ALL SELECT 'customer_360', count(*), count(DISTINCT customer_id) FROM workspace.bank_gold.customer_360
UNION ALL SELECT 'interaction_history', count(*), count(DISTINCT customer_id, interaction_id) FROM workspace.bank_gold.interaction_history
UNION ALL SELECT 'customers', count(*), count(DISTINCT customer_id) FROM workspace.bank_silver.customers
UNION ALL SELECT 'call_transcripts', count(*), count(DISTINCT customer_id, transcript_id) FROM workspace.bank_silver.call_transcripts;
