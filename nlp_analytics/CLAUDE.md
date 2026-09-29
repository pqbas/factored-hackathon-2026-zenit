# NLP / Text Analytics workstream

This folder owns the NLP / Text Analytics use cases of the Factored Datathon 2026 bank assistant.
Scope: topic modeling on call transcripts, intent classification, entity extraction, and Spanish accent detection and classification.
Everything runs in Databricks, including data, models, serving and UI.
There is no local or third-party runtime.

## Platform and budget

- The team has about 400 USD of Databricks credits for 10 days (situation as of 2026-09-28).
  Treat every full-corpus job, GPU cluster and Foundation Model call as a budget decision.
- The data pipeline was built and validated in a Free Edition workspace (`data/databricks.yml`, host `dbc-184e79fe-04dc`), catalog `workspace`.
  Confirm which workspace the credits belong to before deploying anything.
  If it is a different workspace, the medallion tables must be rebuilt there first (see "Data loading" below).
- Prefer serverless compute and SQL warehouses.
  Only start a classic or GPU cluster when a model genuinely needs it, and set auto-termination.
- Before running an LLM (`ai_query`, `ai_classify`, `ai_extract`, model serving) over a whole table:
  1. Run it on a sample of about 200 rows.
  2. Estimate the tokens and cost for the full run.
  3. Deduplicate the input first (see `template_id` below); many transcripts share the same text.
  4. Persist the results to a Delta table so the run never has to be repeated.

## Where the data lives

The shared pipeline lives in `data/` and is owned by another team member.
It is documented in `data/README.md` (Spanish, living document) and `docs/data_pipeline_validation.md`.

| Layer | Schema | Use it for |
|---|---|---|
| Landing | `bank_bronze.landing` volume | Never read directly |
| Bronze | `bank_bronze.<table>` | Only for debugging ingestion; every column is STRING |
| Silver | `bank_silver.<table>` | **The input for all NLP work.** Typed, deduplicated by PK, country normalized |
| DQ report | `bank_silver._dq_report` | Check the latest run before trusting a table |
| Gold | `bank_gold.*` | Agent-facing tables owned by the data/agent workstream |
| NLP | `bank_nlp.*` (to create) | All tables produced by this workstream |

The column contract (names, types, NOT NULL, PK, FK) is `data/pipeline/tables.py`.
Do not duplicate it here; read the typed columns from silver.

### Text sources

| Table | Rows (real) | Text columns | Pre-computed labels |
|---|---:|---|---|
| `call_transcripts` | 171,321 | `full_text`, `customer_text`, `agent_text` | `detected_language`, `detected_accent`, `accent_confidence`, `detected_keywords`, `mentioned_entities` (JSON), `detected_intents`, `main_topics`, `audio_quality`, `transcription_model` |
| `call_center_interactions` | 686,296 | none | `contact_reason`, `reason_category`, `detected_sentiment`, `sentiment_score`, `customer_detected_accent`, `agent_used_accent`, `mentioned_products` (comma-separated) |
| `complaints` | 67,095 | `description`, `resolution` | `case_type`, `category`, `subcategory`, `priority` |
| `satisfaction_surveys` | 212,759 | `open_comments` | `comment_sentiment`, `main_score` |
| `customers` | 150,000 | none | `detected_accent`, `country` |
| `service_agents` | 1,200 | none | `native_accent`, `country_of_origin` |

Join keys: `call_transcripts.interaction_id` → `call_center_interactions.interaction_id` (100% match), and `customer_id` / `agent_id` to the dimensions.
`complaints.origin_interaction_id` is empty in 100% of rows, so complaints cannot be linked to a call.

## Known facts about the real data

Verified on 2026-09-26 by the pipeline validation; re-verify before relying on them.

- Transcripts are templates with unfilled placeholders such as `{monto} {moneda}`.
  A model trained on raw text will learn templates, not language.
- `contact_reason` equals `reason_category`: only 6 values, no fine-grained reason.
- `call_transcripts.duration_seconds` is empty in 14% of rows, although the dictionary says NOT NULL.
- Categorical values mix languages: product types and sentiment are in Spanish, statuses and transaction types in English.
  Never hard-code a filter value from the data dictionary; check the distinct values in silver first.
- Country appears as "México" and "Mexico"; silver normalizes it to "México".
  Accent labels are **not** normalized yet.
- There are no MXN amounts; Mexico operates in USD.
- The dataset is a static snapshot ending 2026-06-17.
  Anchor relative windows to the latest date in the data, never to `current_date()`.
- The dictionary promises ~2% duplicates and late arrivals.
  None were found **by primary key**; duplicates by business key (e.g. several transcripts per interaction) have not been checked yet.
- Timestamps have no time zone and are read as UTC.
  Treat them as local wall-clock time and do not convert them.

## Rules for building on the data

- Select columns explicitly; never `SELECT *` from silver.
  Silver is written with `overwriteSchema`, so new source columns can appear at any time.
- Check `bank_silver._dq_report` for the latest `run_at` before a full NLP run.
  Any `critical` row means the table was not refreshed.
- Parse, don't guess: turn `mentioned_entities` into a typed struct with `from_json`, and delimited label columns into arrays.
  Count parse failures and report them instead of dropping rows silently.
- Keep one row per transcript in NLP tables and carry `transcript_id`, `interaction_id`, `customer_id`, `agent_id` and `process_date` on every row.
- Split train / validation / test **by `template_id`** (group split), not by row.
  A random row split leaks identical templates into the test set and inflates every metric.
- The pre-computed columns (`detected_intents`, `main_topics`, `detected_accent`, `mentioned_entities`, sentiment) are generator outputs.
  Use them as weak labels or as a baseline to beat, and always measure whether they are trivially derivable from `template_id` before calling a model good.
- Accent detection from text is the weakest signal in this dataset (there is no audio).
  Compare text predictions against `customers.detected_accent`, `interactions.customer_detected_accent` and `customers.country` before claiming accuracy.
- Transcripts and customers contain personal data (synthetic, but treat it as real).
  Do not send names, document numbers or phone numbers to external services, and do not print them in notebooks that will be shown.

## Code conventions

Follow the patterns already used in `data/pipeline/`:

- Databricks notebooks as `.py` source files starting with `# Databricks notebook source`, with `# MAGIC %md` headers that explain inputs, outputs and grain.
- Parameters through `dbutils.widgets` (`catalog`, `schema_prefix`); never hard-code the catalog.
- Deployment through a Databricks Asset Bundle.
  This workstream gets its own bundle in `nlp_analytics/databricks.yml`, so deploying it never touches the data pipeline or the agent app.
- Writes are idempotent: `CREATE OR REPLACE TABLE` or `MERGE`, never blind appends (except for run logs).
- Add a table `COMMENT` and column comments to every `bank_nlp` table; the agent and Genie read them.
- Use liquid clustering (`CLUSTER BY`) on the join keys of large tables, e.g. `interaction_id` or `customer_id`.
- Code and code comments in English; `data/README.md` is in Spanish and must be updated when this workstream changes shared tables.
- Log experiments, parameters and metrics to MLflow; register models in Unity Catalog.

## Data loading (if the tables have to be rebuilt)

Rebuilding is done with the shared pipeline, not with ad-hoc uploads:

- Workspace with outbound internet (paid or trial): store the read-only keys in the secret scope `factored-datathon` and run `databricks bundle run bank_data_pipeline --params source=s3` from `data/`.
  This copies straight from the organizer's bucket into the landing volume.
- Free Edition (no S3 egress): `aws s3 sync` to a local folder outside the repo, then `data/scripts/upload_dataset.sh <dir>`, then run the job with `source=archive`.

## Security

- `nlp_analytics/LATAM_Bank_Complete_Data_Dictionary.md` contains the organizer's AWS access key and secret.
  Never commit it as is: redact the credentials section or keep the file out of git.
- Credentials only live in Databricks secret scopes or the local AWS CLI profile, never in code, notebooks, bundles or Markdown.

## Definition of done for a `bank_nlp` table

1. The notebook is in `nlp_analytics/` and deployed by the bundle, not only run by hand.
2. Grain, primary key and source tables are stated in the notebook header and in the table comment.
3. Row count reconciles with its source (e.g. transcripts in = rows out + rows rejected with a reason).
4. Quality checks run and their results are written to a report table.
5. `data/README.md` and this file are updated if a known fact or decision changed.
