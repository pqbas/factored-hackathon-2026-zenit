# Fraud EDA notebooks

[01_fraud_eda.ipynb](01_fraud_eda.ipynb) is the reviewable EDA entry point for Phases 0 and 1.

## Status and execution

Imported into the personal workspace and executed successfully on 2026-10-02 with a one-time serverless run. The checked-in source keeps outputs empty; aggregate results are recorded in `../reports/2026-10-02/eda_report.md` and `eda_data.json`.

1. The notebook is stored at `/Users/diegoalonsorv02@gmail.com/fraud-eda/01_fraud_eda`.
2. A one-time run on serverless completed successfully against `workspace.bank_silver.transactions` version 1. It used the workspace UTC session timezone.
3. To rerun, use notebook serverless compute or a one-time serverless notebook task. No classic cluster was provisioned.
4. The notebook reads source data; aggregate DataFrames and plots are session-only. Display results are capped at 500 rows, and the final run payload contains only aggregates.
5. Review the dated evidence report. Source timestamp timezone semantics and exchange-rate availability at transaction time remain unresolved.
6. Keep the checked-in source output-free. Do not save customer-level records or credentials in a notebook output or artifact.

## Scope and safeguards

Full-snapshot integrity and partition viability checks are separated from train-only feature exploration. The final test is not used to select features. No model fitting, MLflow logging, database writes, workspace publication, or resource creation is performed by notebook code. It does not create temporary SQL views either.

Spark performs distributed aggregation; pandas receives bounded aggregates for matplotlib charts. There is no full-data collect, automatic cache, or row-level export. Multiple aggregate sections still scan data and consume compute; avoid rerunning unchanged sections unnecessarily.

The notebook documents existing feature-helper edge-case differences rather than silently changing the training contract. Resolve these in implementation before model training.

## Supporting evidence

- [Phase 0 report](../reports/2026-09-28/profile_report.md)
- [Phase 1 report](../reports/2026-09-28/features_report.md)
- [Feature implementation](../features.py)
- [Requirements](../spec/28-09-26-fraud-model/requirements.md)

The successful Databricks run validates notebook execution on this workspace runtime and the pinned source snapshot. It does not validate feature usefulness or model quality.

The final notebook cell returns a compact JSON payload of aggregate results through the one-time run output API. It includes no row-level identifiers. Use this payload as the source for the dated evidence report.
