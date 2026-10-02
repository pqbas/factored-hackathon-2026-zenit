# Fraud EDA notebooks

[01_fraud_eda.ipynb](01_fraud_eda.ipynb) is the reviewable EDA entry point for Phases 0 and 1. [02_training_smoke.ipynb](02_training_smoke.ipynb) validates Spark ML compatibility on a small train-only sample. [03_model_training.ipynb](03_model_training.ipynb) runs the Phase 2 temporal model comparison.

## Status and execution

The EDA notebook ran successfully on 2026-10-02. The train-only Spark ML smoke test also passed on Serverless environment v4. The full Phase 2 comparison is currently running as a one-time serverless run. Checked-in notebooks keep outputs empty; bounded aggregate results are stored in the dated reports.

1. Shared workspace notebooks are under `/Shared/fraud-eda`; one-time run records are linked from their dated reports.
2. The EDA and training runs read `workspace.bank_silver.transactions` version 1. The workspace session timezone is UTC.
3. Training requires Serverless environment version 4 for PySpark ML. The one-time submit request specifies that environment and does not create a persistent job.
4. The notebooks read source data. Only bounded aggregates, model metrics, and model artifacts are logged; transaction-level rows and identifiers are not written to reports.
5. Review the dated evidence reports. Source timestamp semantics and exchange-rate availability at transaction time remain unresolved.
6. Keep checked-in sources output-free. Do not save customer-level records or credentials in notebook outputs or artifacts.

## Scope and safeguards

The EDA notebook separates full-snapshot integrity and partition viability checks from train-only feature exploration. The Phase 2 notebook fits preprocessing on train and selects with validation; it explicitly excludes final-test rows. Training uses MLflow for experiment evidence and model artifacts but does not create output tables, register a model, or create a persistent job.

Spark performs distributed aggregation; pandas receives bounded aggregates for matplotlib charts. There is no full-data collect, automatic cache, or row-level export. Multiple aggregate sections still scan data and consume compute; avoid rerunning unchanged sections unnecessarily.

The notebook documents existing feature-helper edge-case differences rather than silently changing the training contract. Resolve these in implementation before model training.

## Supporting evidence

- [Phase 0 report](../reports/2026-09-28/profile_report.md)
- [Phase 1 report](../reports/2026-09-28/features_report.md)
- [Feature implementation](../features.py)
- [Requirements](../spec/28-09-26-fraud-model/requirements.md)

The successful Databricks run validates notebook execution on this workspace runtime and the pinned source snapshot. It does not validate feature usefulness or model quality.

The final notebook cell returns a compact JSON payload of aggregate results through the one-time run output API. It includes no row-level identifiers. Use this payload as the source for the dated evidence report.
