/** Snapshot triage, not a churn probability. Filters run on bounded cached output. */
export const RETENTION_SQL = `
WITH anchor AS (
  SELECT max(as_of_date) AS as_of, min(as_of_date) AS min_as_of
  FROM workspace.bank_gold.customer_360
), tx AS (
  SELECT t.customer_id, max(t.transaction_date) AS last_tx,
    count_if(datediff(a.as_of, to_date(t.transaction_date)) BETWEEN 0 AND 29) AS tx_30,
    count_if(datediff(a.as_of, to_date(t.transaction_date)) BETWEEN 30 AND 59) AS tx_prev_30
  FROM workspace.bank_gold.customer_transactions t CROSS JOIN anchor a
  WHERE t.transaction_date < date_add(a.as_of, 1)
  GROUP BY t.customer_id
), contacts AS (
  SELECT i.customer_id, count(*) AS contacts_90,
    avg(CASE WHEN i.csat BETWEEN 1 AND 5 THEN i.csat END) AS csat,
    count_if(i.csat BETWEEN 1 AND 5) AS csat_n,
    avg(i.sentiment_score) AS sentiment,
    count_if(i.sentiment_score IS NOT NULL) AS sentiment_n,
    count_if(lower(i.contact_reason) RLIKE '(cancel|cierre|encerr|close)' AND i.was_resolved = false) AS cancellation_requests
  FROM workspace.bank_gold.interaction_history i CROSS JOIN anchor a
  WHERE i.interaction_date >= date_sub(a.as_of, 89) AND i.interaction_date < date_add(a.as_of, 1)
  GROUP BY i.customer_id
), cases AS (
  SELECT c.customer_id,
    count_if(c.is_open AND (c.resolution_date IS NULL OR c.resolution_date >= date_add(a.as_of, 1))) AS open_cases,
    count_if(c.creation_date >= date_sub(a.as_of, 89)) AS cases_90
  FROM workspace.bank_gold.customer_cases c CROSS JOIN anchor a
  WHERE c.creation_date < date_add(a.as_of, 1)
  GROUP BY c.customer_id
), eligible AS (
  SELECT c.customer_id, coalesce(c.country, 'Unknown') AS country, coalesce(c.segment, 'Unknown') AS segment,
    a.as_of, datediff(a.as_of, to_date(tx.last_tx)) AS inactive_days,
    coalesce(tx.tx_30, 0) AS tx_30, coalesce(tx.tx_prev_30, 0) AS tx_prev_30,
    coalesce(cases.open_cases, 0) AS open_cases, coalesce(cases.cases_90, 0) AS cases_90,
    contacts.csat, coalesce(contacts.csat_n, 0) AS csat_n,
    contacts.sentiment, coalesce(contacts.sentiment_n, 0) AS sentiment_n,
    coalesce(contacts.cancellation_requests, 0) AS cancellation_requests,
    datediff(a.as_of, to_date(c.registration_date)) AS tenure_days
  FROM workspace.bank_gold.customer_360 c CROSS JOIN anchor a
  LEFT JOIN tx USING (customer_id) LEFT JOIN contacts USING (customer_id) LEFT JOIN cases USING (customer_id)
  WHERE c.customer_status = 'Active' AND c.products_active > 0
    AND c.registration_date < date_add(a.as_of, 1)
), flags AS (
  SELECT *, inactive_days >= 60 AND tenure_days >= 90 AS inactive,
    tx_prev_30 >= 3 AND tx_30 <= tx_prev_30 * 0.5 AND tenure_days >= 60 AS declining,
    open_cases >= 1 AS unresolved, cases_90 >= 2 AS repeated,
    csat_n >= 1 AND csat <= 2 AS low_csat,
    sentiment_n >= 2 AND sentiment < 0 AS negative_sentiment,
    cancellation_requests >= 1 AS cancellation
  FROM eligible
), signals AS (
  SELECT *, filter(array(
    CASE WHEN inactive THEN 'inactive' END, CASE WHEN declining THEN 'declining' END,
    CASE WHEN unresolved THEN 'unresolved' END, CASE WHEN repeated THEN 'repeated' END,
    CASE WHEN low_csat THEN 'low_csat' END, CASE WHEN negative_sentiment THEN 'negative_sentiment' END,
    CASE WHEN cancellation THEN 'cancellation' END), x -> x IS NOT NULL) AS reasons,
    int(coalesce(inactive, false) OR declining) + int(unresolved OR repeated)
      + int(coalesce(low_csat, false) OR coalesce(negative_sentiment, false)) + int(cancellation) AS families
  FROM flags
), ranked AS (
  SELECT *, CASE WHEN cancellation OR families >= 3 THEN 'high'
    WHEN families >= 2 THEN 'medium' WHEN families = 1 THEN 'watch' ELSE 'none' END AS band
  FROM signals
), shortlist AS (
  SELECT *, row_number() OVER (PARTITION BY country, band ORDER BY families DESC, open_cases DESC, customer_id) AS rn
  FROM ranked WHERE band <> 'none'
)
SELECT 'metadata' AS section, to_json(named_struct('asOf', CAST(a.as_of AS STRING),
  'minAsOf', CAST(a.min_as_of AS STRING), 'totalCustomers', (SELECT count(*) FROM workspace.bank_gold.customer_360),
  'eligibleCustomers', (SELECT count(*) FROM ranked),
  'activityUnknown', (SELECT count_if(inactive_days IS NULL) FROM ranked))) AS payload FROM anchor a
UNION ALL SELECT 'bands', to_json(named_struct('band', band, 'total', count(*))) FROM ranked GROUP BY band
UNION ALL SELECT 'countries', to_json(named_struct('country', country, 'total', count(*),
  'high', count_if(band = 'high'), 'medium', count_if(band = 'medium'),
  'watch', count_if(band = 'watch'), 'none', count_if(band = 'none'))) FROM ranked GROUP BY country
UNION ALL SELECT 'segments', to_json(named_struct('segment', segment, 'total', count(*), 'high', count_if(band = 'high')))
  FROM ranked GROUP BY segment
UNION ALL SELECT 'signals', to_json(named_struct('id', reason, 'total', count(*)))
  FROM ranked LATERAL VIEW explode(reasons) AS reason GROUP BY reason
UNION ALL SELECT 'customers', to_json(named_struct('ref', substring(sha2(customer_id, 256), 1, 12),
  'country', country, 'segment', segment, 'band', band, 'signals', reasons,
  'inactiveDays', inactive_days, 'tx30', tx_30, 'txPrevious30', tx_prev_30,
  'openCases', open_cases, 'csat', csat, 'csatResponses', csat_n, 'families', families))
  FROM shortlist WHERE rn <= 15
`;
