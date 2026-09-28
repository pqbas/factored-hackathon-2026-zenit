# Persistent reference: fraud data and model

Updated: 2026-09-28. This file preserves working context; it contains no credentials.

## Sources

- Local documents: `/home/diego/Descargas/documents_factored_hackathon/`: challenge statement, LATAM Bank Complete Data Dictionary v1.0.0, and Dataset Summary.
- Transcribed contract: `data/pipeline/tables.py` (the schemas below come from this contract, not a new PDF transcription).
- Previous profiling: `docs/data_pipeline_validation.md` and `data/README.md`.
- Earlier proposal: `docs/ml_fraud_model_proposal.md`; its references to data not yet received are outdated.
- Requested article: https://www.databricks.com/blog/2019/05/02/detecting-financial-fraud-at-scale-with-decision-trees-and-mlflow-on-databricks.html

## Direct workspace verification

- Host: `https://dbc-184e79fe-04dc.cloud.databricks.com`.
- CLI: `personal` profile, OAuth authentication with the user's personal account. Do not switch to the owner's identity.
- Catalog: `workspace`. Visible banking schemas: `bank_bronze`, `bank_silver`, `bank_gold`, `bank_ops`, `bank_uc_consultas`.
- Silver: 13 contract tables and `_dq_report`, all Delta.
- Gold: `contact_reason_daily`, `customer_360`, `customer_cases`, `customer_products`, `customer_transactions`, `interaction_history`, all Delta.
- Ingestion job: `164322944087673` (`bank-assistant-data-pipeline`); latest listed run `913800443587489`, SUCCESS.
- Update test job: `671094032226530`.
- SQL warehouse: `07ca55766c9c5097`.
- An aggregate query on transactions failed with `INSUFFICIENT_PERMISSIONS`: missing `USE SCHEMA` on `workspace.bank_silver`. Visible metadata does not prove SELECT access. No permissions or tables were changed.

> **Status update (2026-09-28):** read access is now working. `SELECT` and
> `DESCRIBE HISTORY` on `workspace.bank_silver.transactions` succeed with the
> `personal` profile; Phase 0 profiling and Phase 1 feature validation both ran
> against Delta version 1. The access-block note above is historical and no
> longer current.

## Documented ingestion and local code

Organizer CSVs → compressed files uploaded to a volume → acquire (`source=archive`) → bronze (Auto Loader, strings and provenance) → silver (types, normalization, deduplication and quality) → gold (tables for the agent).
Bronze is incremental; silver is recomputed; gold depends on quality checks. See `data/databricks.yml` and `data/pipeline/`.
The 2026-09-26 report records 4,425,008 transactions; `data/README.md` records 4,316 fraud cases (~0.10%). These are previous team results, not counts verified today. The reports also describe missing MXN, empty `complaints.origin_interaction_id`, and a high risk of leakage from fraud_score.

## Proposed adaptation of the article

Objective: estimate fraud risk per transaction and support human review routing; action policy remains separate.

1. Primary source: `workspace.bank_silver.transactions`; target: `is_fraud`. Keep transaction_id for provenance, not as a predictor.
2. First interpretable model: decision tree; compare against a constant predictor and logistic regression. Log configuration, data versions, metrics, and artifacts in MLflow.
3. Initial candidate predictors: amount/amount_usd, currency, type, channel, merchant category, country, and hour/day; validate temporal availability and missing values.
4. Exclude fraud_score, is_fraud as a predictor, transaction_status, response_code, and current snapshot states. Personal identifiers are not predictors. Historical aggregates must use strictly earlier events.
5. Proposed temporal split: train through 2025-06-30; validation from 2025-07-01 through 2025-12-31; test from 2026-01-01. Confirm dates and positives per period before fixing the split. Fit preprocessing on train only.
6. Measure PR-AUC/average precision (specify implementation), precision, recall, confusion matrix, and recall under a review budget. Choose the threshold on validation; preserve original test prevalence. Apply balancing to train only.
7. `fraud_score >= 70` may be shown as a potentially contaminated diagnostic reference, not a clean baseline or evidence of generalization until its temporal provenance is established.
8. The article uses PaySim, rule-derived labels, and a random split. We have a supplied label: do not recreate it with rules or attribute real fraud improvements to imitating a synthetic rule.
9. First verify whether synthetic fraud has learnable signal; report results even if they do not beat the baseline. Do not promise performance.
10. Proposed future output: a score table with transaction_id, score, version, and timestamp. `bank_ml` was not among the visible schemas, nor was `transaction_risk` among visible gold tables. No model was trained or deployed in this review.

## Permissions needed to continue

The owner/administrator must grant the personal account USE CATALOG on workspace, USE SCHEMA on bank_silver, and SELECT on training tables. Also verify CAN USE on the warehouse. ML resource creation and permissions will be planned separately; write access to source tables is unnecessary.

## The 13 contract tables

### customers (dimension)

PK: customer_id. Deduplication order: last_updated.

| Column | Type | Not null |
|---|---|---|
| customer_id | STRING | yes |
| document_number | STRING | yes |
| document_type | STRING | yes |
| first_name | STRING | yes |
| last_name | STRING | yes |
| date_of_birth | DATE | yes |
| gender | STRING | no |
| email | STRING | no |
| mobile_phone | STRING | no |
| landline_phone | STRING | no |
| address | STRING | no |
| city | STRING | yes |
| state | STRING | yes |
| country | STRING | yes |
| postal_code | STRING | no |
| detected_accent | STRING | no |
| segment | STRING | yes |
| credit_score | INT | no |
| estimated_monthly_income | DECIMAL(12,2) | no |
| occupation | STRING | no |
| marital_status | STRING | no |
| education_level | STRING | no |
| registration_date | TIMESTAMP | yes |
| registration_branch_id | STRING | yes |
| customer_status | STRING | yes |
| last_updated | TIMESTAMP | yes |
| accepts_marketing | BOOLEAN | yes |

### products (dimension)

PK: product_id. Deduplication order: last_updated.

| Column | Type | Not null |
|---|---|---|
| product_id | STRING | yes |
| customer_id | STRING | yes |
| product_type | STRING | yes |
| product_number | STRING | yes |
| currency | STRING | yes |
| current_balance | DECIMAL(15,2) | yes |
| credit_limit | DECIMAL(15,2) | no |
| interest_rate | DECIMAL(5,2) | no |
| opening_date | DATE | yes |
| expiration_date | DATE | no |
| opening_branch_id | STRING | yes |
| product_status | STRING | yes |
| opening_channel | STRING | yes |
| has_linked_app | BOOLEAN | yes |
| days_past_due | INT | no |
| last_transaction_date | TIMESTAMP | no |
| last_updated | TIMESTAMP | yes |

### branches (dimension)

PK: branch_id. Deduplication order: unspecified.

| Column | Type | Not null |
|---|---|---|
| branch_id | STRING | yes |
| branch_code | STRING | yes |
| branch_name | STRING | yes |
| branch_type | STRING | yes |
| address | STRING | yes |
| city | STRING | yes |
| state | STRING | yes |
| country | STRING | yes |
| postal_code | STRING | no |
| geographic_zone | STRING | yes |
| phone | STRING | yes |
| email | STRING | no |
| opening_time | STRING | yes |
| closing_time | STRING | yes |
| has_atms | BOOLEAN | yes |
| atm_count | INT | no |
| has_teller_windows | BOOLEAN | yes |
| teller_window_count | INT | no |
| latitude | DECIMAL(10,7) | no |
| longitude | DECIMAL(10,7) | no |
| branch_opening_date | DATE | yes |
| branch_status | STRING | yes |

### service_agents (dimension)

PK: agent_id. Deduplication order: unspecified.

| Column | Type | Not null |
|---|---|---|
| agent_id | STRING | yes |
| employee_code | STRING | yes |
| first_name | STRING | yes |
| last_name | STRING | yes |
| email | STRING | yes |
| phone | STRING | no |
| native_accent | STRING | yes |
| country_of_origin | STRING | yes |
| assigned_branch_id | STRING | no |
| agent_type | STRING | yes |
| experience_level | STRING | yes |
| languages | STRING | yes |
| specialty | STRING | no |
| hire_date | DATE | yes |
| avg_csat | DECIMAL(3,2) | no |
| total_monthly_interactions | INT | no |
| agent_status | STRING | yes |
| work_shift | STRING | yes |

### marketing_campaigns (dimension)

PK: campaign_id. Deduplication order: unspecified.

| Column | Type | Not null |
|---|---|---|
| campaign_id | STRING | yes |
| campaign_name | STRING | yes |
| description | STRING | no |
| campaign_type | STRING | yes |
| campaign_objective | STRING | yes |
| promoted_product | STRING | no |
| target_segment | STRING | no |
| target_country | STRING | no |
| start_date | DATE | yes |
| end_date | DATE | yes |
| budget | DECIMAL(12,2) | no |
| campaign_status | STRING | yes |
| expected_conversion_rate | DECIMAL(5,2) | no |

### transactions (fact)

PK: transaction_id. Deduplication order: process_date.

| Column | Type | Not null |
|---|---|---|
| transaction_id | STRING | yes |
| transaction_date | TIMESTAMP | yes |
| process_date | DATE | yes |
| product_id | STRING | yes |
| customer_id | STRING | yes |
| transaction_type | STRING | yes |
| transaction_category | STRING | no |
| amount | DECIMAL(15,2) | yes |
| currency | STRING | yes |
| amount_usd | DECIMAL(15,2) | no |
| channel | STRING | yes |
| branch_id | STRING | no |
| merchant_name | STRING | no |
| merchant_category | STRING | no |
| transaction_country | STRING | yes |
| transaction_city | STRING | no |
| transaction_status | STRING | yes |
| response_code | STRING | no |
| is_fraud | BOOLEAN | yes |
| fraud_score | DECIMAL(5,2) | no |
| latitude | DECIMAL(10,7) | no |
| longitude | DECIMAL(10,7) | no |

### call_center_interactions (fact)

PK: interaction_id. Deduplication order: process_date.

| Column | Type | Not null |
|---|---|---|
| interaction_id | STRING | yes |
| interaction_date | TIMESTAMP | yes |
| process_date | DATE | yes |
| customer_id | STRING | yes |
| agent_id | STRING | no |
| interaction_type | STRING | yes |
| channel | STRING | yes |
| contact_reason | STRING | yes |
| reason_category | STRING | yes |
| duration_seconds | INT | no |
| wait_time_seconds | INT | no |
| was_resolved | BOOLEAN | no |
| requires_followup | BOOLEAN | yes |
| detected_sentiment | STRING | no |
| sentiment_score | DECIMAL(3,2) | no |
| customer_detected_accent | STRING | no |
| agent_used_accent | STRING | no |
| was_escalated | BOOLEAN | yes |
| mentioned_products | STRING | no |
| has_transcript | BOOLEAN | yes |
| has_recording | BOOLEAN | yes |

### call_transcripts (fact)

PK: transcript_id. Deduplication order: process_date.

| Column | Type | Not null |
|---|---|---|
| transcript_id | STRING | yes |
| interaction_id | STRING | yes |
| process_date | DATE | yes |
| customer_id | STRING | yes |
| agent_id | STRING | yes |
| full_text | STRING | yes |
| customer_text | STRING | no |
| agent_text | STRING | no |
| detected_language | STRING | yes |
| detected_accent | STRING | no |
| accent_confidence | DECIMAL(3,2) | no |
| detected_keywords | STRING | no |
| mentioned_entities | STRING | no |
| detected_intents | STRING | no |
| main_topics | STRING | no |
| transcription_model | STRING | yes |
| audio_quality | STRING | no |
| duration_seconds | INT | yes |

### satisfaction_surveys (fact)

PK: survey_id. Deduplication order: process_date.

| Column | Type | Not null |
|---|---|---|
| survey_id | STRING | yes |
| survey_date | TIMESTAMP | yes |
| process_date | DATE | yes |
| interaction_id | STRING | no |
| customer_id | STRING | yes |
| agent_id | STRING | no |
| survey_type | STRING | yes |
| send_channel | STRING | yes |
| main_score | INT | yes |
| nps_category | STRING | no |
| question_1_text | STRING | no |
| question_1_response | INT | no |
| question_2_text | STRING | no |
| question_2_response | INT | no |
| question_3_text | STRING | no |
| question_3_response | INT | no |
| open_comments | STRING | no |
| comment_sentiment | STRING | no |
| response_time_hours | DECIMAL(8,2) | no |
| campaign_response_rate | DECIMAL(5,2) | no |

### digital_events (fact)

PK: event_id. Deduplication order: process_date.

| Column | Type | Not null |
|---|---|---|
| event_id | STRING | yes |
| event_date | TIMESTAMP | yes |
| process_date | DATE | yes |
| customer_id | STRING | no |
| session_id | STRING | yes |
| event_type | STRING | yes |
| event_category | STRING | yes |
| channel | STRING | yes |
| platform | STRING | no |
| browser | STRING | no |
| app_version | STRING | no |
| page_url | STRING | no |
| page_title | STRING | no |
| action | STRING | no |
| element_id | STRING | no |
| product_id | STRING | no |
| event_value | DECIMAL(15,2) | no |
| duration_seconds | INT | no |
| ip_address | STRING | no |
| ip_country | STRING | no |
| ip_city | STRING | no |
| is_mobile | BOOLEAN | yes |
| referrer | STRING | no |
| utm_source | STRING | no |
| utm_medium | STRING | no |
| utm_campaign | STRING | no |

### complaints (fact)

PK: complaint_id. Deduplication order: process_date.

| Column | Type | Not null |
|---|---|---|
| complaint_id | STRING | yes |
| creation_date | TIMESTAMP | yes |
| process_date | DATE | yes |
| customer_id | STRING | yes |
| case_type | STRING | yes |
| category | STRING | yes |
| subcategory | STRING | no |
| reception_channel | STRING | yes |
| affected_product_id | STRING | no |
| related_branch_id | STRING | no |
| origin_interaction_id | STRING | no |
| description | STRING | yes |
| claimed_amount | DECIMAL(15,2) | no |
| currency | STRING | no |
| priority | STRING | yes |
| status | STRING | yes |
| assigned_agent_id | STRING | no |
| assignment_date | TIMESTAMP | no |
| first_response_date | TIMESTAMP | no |
| resolution_date | TIMESTAMP | no |
| closing_date | TIMESTAMP | no |
| sla_breached | BOOLEAN | yes |
| resolution_days | INT | no |
| resolution | STRING | no |
| compensation_granted | DECIMAL(15,2) | no |
| resolution_satisfaction | INT | no |
| is_repeat_complainer | BOOLEAN | yes |

### campaign_sends (fact)

PK: send_id. Deduplication order: process_date.

| Column | Type | Not null |
|---|---|---|
| send_id | STRING | yes |
| send_date | TIMESTAMP | yes |
| process_date | DATE | yes |
| campaign_id | STRING | yes |
| customer_id | STRING | yes |
| send_channel | STRING | yes |
| template_used | STRING | no |
| subject | STRING | no |
| send_status | STRING | yes |
| was_delivered | BOOLEAN | yes |
| was_opened | BOOLEAN | no |
| open_date | TIMESTAMP | no |
| was_clicked | BOOLEAN | no |
| click_date | TIMESTAMP | no |
| click_count | INT | no |
| had_conversion | BOOLEAN | yes |
| conversion_date | TIMESTAMP | no |
| conversion_value | DECIMAL(15,2) | no |
| open_device | STRING | no |
| open_country | STRING | no |
| failure_reason | STRING | no |
| send_cost | DECIMAL(10,4) | no |

### daily_exchange_rates (reference)

PK: date, source_currency, target_currency. Deduplication order: unspecified.

| Column | Type | Not null |
|---|---|---|
| date | DATE | yes |
| source_currency | STRING | yes |
| target_currency | STRING | yes |
| exchange_rate | DECIMAL(12,6) | yes |
| buy_rate | DECIMAL(12,6) | no |
| sell_rate | DECIMAL(12,6) | no |
| source | STRING | no |


## Additional access checks (2026-09-28)

- Actual `SELECT 1 ... LIMIT 1` queries failed because of missing USE SCHEMA on bank_bronze.transactions, bank_silver.transactions, bank_gold.customer_transactions, and bank_ops.dispute_cases. No customer data was returned.
- The personal account belongs to workspace groups admins, users, and account users. This did not resolve Unity Catalog read permissions.
- Warehouse 07ca55766c9c5097 ACL: users has CAN_USE and admins has CAN_MANAGE. Queries reach the data permission check.
- MLflow experiment 945803452603434 (/Users/pcubasm1@gmail.com/bank-assistant-local): admins has CAN_MANAGE according to its ACL; listing experiments is allowed. No run was created and the shared experiment was not modified.
- clusters list returned no clusters; this does not prove that serverless compute is unavailable. No training was executed.
- Unity Catalog get-effective queries returned empty objects, even without a principal filter; these are not treated as exhaustive proof of missing privileges.
- Creating tables/models within the banking schemas is blocked by the confirmed missing USE SCHEMA privilege. No CREATE operations were attempted and creation in other schemas was not checked; the specific CREATE MODEL/CREATE TABLE permissions remain unverified.
