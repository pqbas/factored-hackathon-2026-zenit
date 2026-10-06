/** A single aggregate pass. Final-test labels are excluded from refreshed analytics. */
export const FRAUD_LIVE_SQL = `
WITH base AS (
 SELECT transaction_id, transaction_date, is_fraud, transaction_country AS country, channel,
   transaction_type AS type, currency, date_format(transaction_date, 'yyyy-MM') AS month,
   merchant_category, amount_usd,
   CASE WHEN currency = 'USD' THEN amount ELSE amount_usd END AS normalized_amount
 FROM workspace.bank_silver.transactions
 WHERE transaction_date < TIMESTAMP '2026-01-01'
)
SELECT CASE WHEN grouping(country) = 0 THEN 'countries'
 WHEN grouping(channel) = 0 THEN 'channels' WHEN grouping(type) = 0 THEN 'types'
 WHEN grouping(currency) = 0 THEN 'currencies' WHEN grouping(month) = 0 THEN 'monthly' ELSE 'summary' END AS section,
 coalesce(country, channel, type, currency, month, 'Unknown') AS label,
 count(*) AS total, count_if(is_fraud) AS fraud,
 count_if(transaction_id IS NULL) AS null_ids, count_if(is_fraud IS NULL) AS null_labels,
 count_if(merchant_category IS NULL) AS merchant_missing, count_if(amount_usd IS NULL) AS usd_missing,
 count_if(normalized_amount IS NULL) AS normalized_missing,
 CAST(min(transaction_date) AS STRING) AS min_date, CAST(max(transaction_date) AS STRING) AS max_date
FROM base GROUP BY GROUPING SETS ((country), (channel), (type), (currency), (month), ())
`;
