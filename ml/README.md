# ML: fraud risk model

Planning area for the fraud-risk model that will support dispute escalation decisions.

Documentation convention: write all new or updated Markdown documentation in English, including diagram labels, tables, and specifications.

Implementation specs: [roadmap](spec/roadmap.md), [requirements and models](spec/28-09-26-fraud-model/requirements.md), [plan](spec/28-09-26-fraud-model/plan.md), and [validation](spec/28-09-26-fraud-model/validation.md). These specs are the current reference for implementation; the data map supplies the schema context.

Start with [Data map and features](data_map_and_features.md): diagrams of all 13 tables and their relationships, candidate features, leakage exclusions, and the initial experiment plan. This is the working document for design iterations.

Earlier proposal: [`docs/ml_fraud_model_proposal.md`](../docs/ml_fraud_model_proposal.md). Persistent schema and access reference: [`docs/fraud_data_reference.md`](../docs/fraud_data_reference.md).

Planned layout:

```
ml/
├── profile.py         # Phase 0 read-only profiling (Implemented ✓)
├── features.py        # Phase 1 V1 feature contract + temporal split (Implemented ✓)
├── validate_features.py  # Phase 1 read-only USD-amount validation (Implemented ✓)
├── train.py           # temporal split, baselines vs model, MLflow tracking, UC model registry
├── score.py           # proposed batch scoring -> bank_ml.transaction_risk
├── tests/             # local tests for ml modules
├── reports/           # profiling + feature evidence (Phase 0/1 outputs)
└── databricks.yml     # serverless jobs for training and scoring
```

Status (2026-10-02): **Phases 0 and 1 are complete, and the EDA notebook has run successfully on serverless.** Model training has not started.

Phase 0 measurements: [reports/2026-09-28/profile_report.md](reports/2026-09-28/profile_report.md)

- **4,425,008 rows** (matches previous team count; dictionary says 5,000,000).
- **4,316 fraud positives (0.0975%)** — severe class imbalance confirmed.
- **Zero null IDs, zero null labels, zero duplicates.**
- **Temporal split viable**: train 2,994,597 (3,014 fraud), val 743,909 (699), test 686,502 (603).
- **fraud_score >= 70 is strongly associated with the label** (999 rows, 100% fraudulent, 0 false positives). Excluded from predictors as a leakage precaution.
- **76.8% of `merchant_category` is null** (only 6 distinct values among 23% populated). Limited signal.
- Train/compute compatibility remains unverified.

Phase 1 feature contract: [features.py](features.py), validation [reports/2026-09-28/features_report.md](reports/2026-09-28/features_report.md)

- V1 predictors: `amount`, `currency`, `log_abs_amount`, `amount_sign`, `amount_usd_norm`, `transaction_type`, `channel`, `transaction_country`, `merchant_category`, `hour`, `weekday`, `is_weekend`.
- **Normalized USD amount is viable**: only 2.25% missing (non-USD rows without a conversion), vs 57.3% for raw `amount_usd` (all USD rows lack a conversion because they are already USD). Conversion ratios are internally consistent per currency.
- No fitted preprocessing (imputers/encoders/scalers) in this phase; those are train-only and belong to Phase 2.

## Exploratory notebook

[Fraud EDA notebook](notebooks/01_fraud_eda.ipynb) organizes Phases 0/1 into questions, Spark aggregate queries, charts, and interpretation cells. See [execution instructions](notebooks/README.md). It was executed successfully on serverless against Delta version 1. See [the dated EDA report](reports/2026-10-02/eda_report.md) and aggregate evidence JSON.

Phase 0/1 EDA notebook execution: [report](reports/2026-10-02/eda_report.md), [aggregate JSON evidence](reports/2026-10-02/eda_data.json). It ran on 2026-10-02 against Delta v1; no model training or source table writes occurred.
