# Data pipeline

Acquire → bronze → silver → gold for the LATAM Bank dataset (Factored Datathon 2026) on Databricks serverless.
Validation against the real dataset and the fixes it required: [docs/data_pipeline_validation.md](../docs/data_pipeline_validation.md).

```
data/
├── pipeline/
│   ├── tables.py                      # data contract: 13 tables, types, NOT NULL, PKs, FKs, value aliases, thresholds
│   ├── 00_acquire.py                  # dataset → landing volume (source = s3 | archive | landing)
│   ├── 01_bronze.py                   # Auto Loader, incremental, all STRING, BOM stripped, lineage columns
│   ├── 02_silver.py                   # typed, normalized, dedup by PK, _dq_report, blocking quality gates
│   ├── 03_gold.py                     # agent-facing tables + bank_ops.dispute_cases
│   └── 90_test_update_correctness.py  # TEST FIXTURE: late/corrected/duplicate/new-column deliveries
├── scripts/upload_dataset.sh          # local dataset → one .tar.gz per table in bank_bronze.uploads
├── generate_dummy_data.py             # synthetic data with the same contract (tests / offline dev)
└── databricks.yml                     # jobs: bank-assistant-data-pipeline, bank-assistant-data-update-test
```

Unity Catalog (catalog `workspace`): `bank_bronze` (volumes `uploads`, `landing`, `checkpoints`), `bank_silver`
(+ `_dq_report`), `bank_gold`, `bank_ops`.

## Load the real dataset

Databricks Free Edition blocks outbound S3 from serverless, so the data goes through a local copy:

```bash
aws s3 sync s3://factored-datathon-2026-s3-157725502942-us-east-2-an/data/ ~/factored/hackathon-data/raw/
data/scripts/upload_dataset.sh ~/factored/hackathon-data/raw          # ~750 MB compressed, ~3 min
cd data && databricks bundle deploy
databricks bundle run bank_data_pipeline                             # source=archive (default)
```

In a workspace with internet egress, skip the upload: `--params source=s3` copies straight from the bucket with the
read-only keys in the secret scope `factored-datathon` (`aws_access_key_id`, `aws_secret_access_key`).

`--params reset=true` rebuilds bronze from scratch (drops bronze tables and checkpoints).

## Update and freshness policy

- **New or corrected files:** bronze reads only files it has not seen (Auto Loader checkpoints). Silver is
  recomputed from bronze, keeping the latest version of each key (`order_by` column, then ingestion time).
- **New source columns:** added to bronze automatically (the bronze task retries once) and kept in silver as STRING.
- **Quality gates:** a table with null PKs, >1% unparseable values, a missing NOT NULL column, or no rows keeps its
  last good silver version, and the job fails before gold. Everything else is reported in `bank_silver._dq_report`
  with a severity.
- **Freshness:** `_dq_report` records the max `process_date` per fact table on every run. The organizer's dataset
  is a static snapshot (2023-06-17 → 2026-06-17), so the pipeline runs on demand, not on a schedule.
- **Proof:** `databricks bundle run bank_data_update_test` runs the labeled fixture in isolated `test_update_*`
  schemas.

## Dummy data (offline)

```bash
python data/generate_dummy_data.py   # -> data/dummy_output/ (gitignored)
```

The dummy data follows the contract but uses English product types and `CUS…` ids; the real data uses Spanish
product types and `CLI-…` ids.
