# Data pipeline

Bronze → silver → gold tables for the LATAM Bank dataset (Factored Datathon 2026), runnable today on dummy data and
unchanged on the real data.

```
data/
├── generate_dummy_data.py   # local, stdlib only: CSVs with the real schema, ~2% dups, ~5% nulls
├── pipeline/
│   ├── tables.py            # data contract: 13 tables, types, NOT NULL, PKs, FKs (from the data dictionary)
│   ├── 01_bronze.py         # Auto Loader, incremental, all STRING + _source_file/_ingested_at lineage
│   ├── 02_silver.py         # typed (try_cast), dedup by PK (latest wins), appends to bank_silver._dq_report
│   └── 03_gold.py           # agent-facing tables (customer_360, products, transactions, cases, interactions)
└── databricks.yml           # separate bundle: one serverless job, no app / Lakebase
```

Unity Catalog layout (catalog `workspace`): `bank_bronze` (+ volumes `landing`, `checkpoints`), `bank_silver`, `bank_gold`.
Files land in `/Volumes/workspace/bank_bronze/landing/<table>/*.csv`.

## Run with dummy data

```bash
python data/generate_dummy_data.py                       # -> data/dummy_output/ (gitignored)
databricks fs cp -r --overwrite data/dummy_output dbfs:/Volumes/workspace/bank_bronze/landing
cd data && databricks bundle deploy && databricks bundle run bank_data_pipeline
```

## Switch to the real dataset

1. Remove the dummy files: `databricks fs rm -r dbfs:/Volumes/workspace/bank_bronze/landing/<table>` for each table.
2. Copy the real files into `landing/<table>/` (one folder per table; any file names and sub-folders work).
3. Run once with `reset=true` so bronze drops the dummy rows and checkpoints:
   `databricks bundle run bank_data_pipeline --params reset=true`
4. Check `bank_silver._dq_report` for cast failures, missing/unexpected columns and orphan FKs, and adjust `tables.py`
   if the real schema differs from the dictionary.

Later file deliveries only need step 2 plus a normal run: bronze picks up new files only, silver is recomputed.
