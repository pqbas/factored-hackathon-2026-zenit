# Fraud EDA notebooks

[01_fraud_eda.ipynb](01_fraud_eda.ipynb) is the reviewable EDA entry point for Phases 0 and 1.

## Status and execution

Prepared locally; not imported or executed in Databricks. All code outputs and execution counts are intentionally empty. Historical findings are explicitly attributed to the existing reports.

1. Obtain approval before creating the notebook resource in the workspace. Use an approved existing Databricks Python environment with Spark, pandas, and matplotlib; a SQL warehouse alone is not sufficient evidence of compatibility.
2. Import the notebook or open it from an approved workspace repository. Do not provision compute or install packages without reviewing the requirement.
3. Confirm read access to `workspace.bank_silver.transactions`, Delta version 1, and the runtime/session timezone. If time travel is unavailable, stop; do not silently switch snapshots or change retention.
4. Run from the first cell downward. Computations read source data only. Session DataFrames and plots do not create database tables. Outputs are aggregates capped at 500 rows; excessive cardinality fails explicitly.
5. Fill the final Markdown decision table using actual outputs. Source timezone remains unconfirmed, so report rather than conceal timezone-dependent differences.
6. Review outputs before saving an executed copy. Never retain individual transaction/customer records or credentials. Preserve the unexecuted source when sharing code unless an executed evidence artifact is explicitly intended.

## Scope and safeguards

Full-snapshot integrity and partition viability checks are separated from train-only feature exploration. The final test is not used to select features. No model fitting, MLflow logging, database writes, workspace publication, or resource creation is performed by notebook code. It does not create temporary SQL views either.

Spark performs distributed aggregation; pandas receives bounded aggregates for matplotlib charts. There is no full-data collect, automatic cache, or row-level export. Multiple aggregate sections still scan data and consume compute; avoid rerunning unchanged sections unnecessarily.

The notebook documents existing feature-helper edge-case differences rather than silently changing the training contract. Resolve these in implementation before model training.

## Supporting evidence

- [Phase 0 report](../reports/2026-09-28/profile_report.md)
- [Phase 1 report](../reports/2026-09-28/features_report.md)
- [Feature implementation](../features.py)
- [Requirements](../spec/28-09-26-fraud-model/requirements.md)

Local checks validate notebook structure and Python cell syntax, not Spark execution or live query correctness. Runtime validation remains pending.
