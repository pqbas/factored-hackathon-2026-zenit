# Fraud EDA notebooks

[01_fraud_eda.ipynb](01_fraud_eda.ipynb) is the reviewable EDA entry point for Phases 0 and 1. [02_training_smoke.ipynb](02_training_smoke.ipynb) validates Spark ML compatibility on a small train-only sample. [03_model_training.ipynb](03_model_training.ipynb) runs the V1/V2 temporal model comparison. [05_feature_challenger.ipynb](05_feature_challenger.ipynb) evaluates V3 transaction category and coarse geolocation. [06_behavioral_challenger.ipynb](06_behavioral_challenger.ipynb) evaluates V4 customer-specific merchant and location familiarity. [07_fraud_score_provenance.ipynb](07_fraud_score_provenance.ipynb) checks validation-only alignment between `fraud_score` and the label; it does not establish when that score is available.
[04_digital_event_coverage.ipynb](04_digital_event_coverage.ipynb) checks whether strictly prior digital activity covers enough train/validation transactions to justify V3.

[08_train_signal_audit.ipynb](08_train_signal_audit.ipynb) checks training-only category/hour/month rates and positive-label support for the proposed V5 internal periods. Equivalent aggregate SQL completed through the SQL API on 2026-10-03; see [the audit report](../reports/2026-10-03/train_signal_audit_report.md). The notebook does not train CatBoost or establish label provenance. Follow the [V5 improvement specification](../spec/28-09-26-fraud-model/improvement_v5.md) before fitting any challenger.

[09_catboost_challenger.ipynb](09_catboost_challenger.ipynb) executes four V5 CatBoost candidates with a shared V4 feature builder, chronological internal periods, train-only negative sampling with inverse inclusion weights, natural evaluation prevalence, and frozen thresholds. It is published at `/Shared/fraud-eda/09_catboost_challenger`; `train_v4` and `train_v5` source notebooks must be present beside it. The run requires Serverless environment v4 with `catboost==1.2.8`. Spark causal-window fixtures and a toy CatBoost compatibility smoke test precede the actual experiment. It does not open the final test or create database/serving resources.

V5 completed successfully on 2026-10-04. The selected C3 CatBoost candidate produced 0.161% precision at the frozen approximately 1% review threshold and ROC-AUC 0.5038 on later exploratory validation. It failed supported 20%/50%/80% precision targets and is not promoted. See [the execution report](../reports/2026-10-04/training_v5_catboost_report.md).

## Status and execution

The EDA notebook ran successfully on 2026-10-02. The train-only Spark ML smoke test also passed on Serverless environment v4. Full Phase 2 submissions exposed two constraints (Spark ML needs serverless environment v4; serverless rejects explicit DataFrame persistence). V1, V2, and one bounded V2 Random Forest challenger completed without a promotable result. The V3 digital-event coverage audit requires `SELECT` on `workspace.bank_silver.digital_events`; the current principal lacks that grant. Checked-in notebooks keep outputs empty; bounded aggregate results are stored in the dated reports.

1. Shared workspace notebooks are under `/Shared/fraud-eda`; one-time run records are linked from their dated reports.
2. The EDA and training runs read `workspace.bank_silver.transactions` version 1. The workspace session timezone is UTC.
3. Training requires Serverless environment version 4 for PySpark ML. The one-time submit request specifies that environment and does not create a persistent job.
4. The notebooks read source data. Only bounded aggregates, model metrics, and model artifacts are logged; transaction-level rows and identifiers are not written to reports.
5. Review the dated evidence reports. Source timestamp semantics and exchange-rate availability at transaction time remain unresolved.
6. Keep checked-in sources output-free. Do not save customer-level records or credentials in notebook outputs or artifacts.

## Scope and safeguards

The EDA notebook separates full-snapshot integrity and partition viability checks from train-only feature exploration. The Phase 2 notebook fits preprocessing on train and selects with validation; it explicitly excludes final-test rows. Training logs metrics and a non-executable model specification to MLflow. Binary Spark model logging requires a writable Unity Catalog Volume, which is not currently available. The run does not create output tables, register a model, or create a persistent job.

Spark performs distributed aggregation; pandas receives bounded aggregates for matplotlib charts. There is no full-data collect, automatic cache, or row-level export. Multiple aggregate sections still scan data and consume compute; avoid rerunning unchanged sections unnecessarily.

The notebook documents existing feature-helper edge-case differences rather than silently changing the training contract. Resolve these in implementation before model training.

## Supporting evidence

- [Phase 0 report](../reports/2026-09-28/profile_report.md)
- [Phase 1 report](../reports/2026-09-28/features_report.md)
- [Feature implementation](../features.py)
- [Requirements](../spec/28-09-26-fraud-model/requirements.md)

The successful Databricks run validates notebook execution on this workspace runtime and the pinned source snapshot. It does not validate feature usefulness or model quality.

The V3 challenger completed on 2026-10-03 and did not improve over V2 or the random-ranking baseline. See [the challenger report](../reports/2026-10-03/training_v3_feature_challenger_report.md). It reads the pinned source snapshot and logs aggregate metrics; it does not write tables or register a model.

The V4 challenger completed on 2026-10-03. Its best candidate assigned one constant score to every validation row (ROC-AUC 0.50); top-k counts are therefore arbitrary tie-break results, not a risk ranking. See [the V4 report](../reports/2026-10-03/training_v4_behavioral_challenger_report.md).

The fraud-score alignment diagnostic completed as a read-only aggregate query on validation only; see [the report](../reports/2026-10-03/fraud_score_validation_diagnostic_report.md). High label agreement is not a deployable result until the score's generation time and provenance are confirmed.

The final notebook cell returns a compact JSON payload of aggregate results through the one-time run output API. It includes no row-level identifiers. Use this payload as the source for the dated evidence report.
