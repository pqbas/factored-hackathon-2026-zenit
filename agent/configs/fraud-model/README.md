# Executable experimental fraud model

`model.cbm` is the native CatBoost 1.2.8 model trained in Databricks run
`1029482291508951`, task `1105616283771884`, MLflow run
`663c44e0c3de40718830f5362dce5a9b`. `manifest.json` records the fitted medians,
ordered features, frozen threshold, source Delta version, source hashes and
evaluation results. The loader checks the binary SHA-256 before use.

The artifact contains learned model parameters, not exported transaction records
or credentials. Training used existing Gold Delta version 1 with a shared feature
contract supported by the existing Lakebase mirror. No geographic coordinates
are invented to reuse a model trained with unavailable serving fields.

Validation precision is **0.083056% (6 / 7,224 alerts)** and recall is
**0.858369% (6 / 699 labeled frauds)**. ROC-AUC is 0.496829. This candidate has no
validated decision utility and is not an improvement over V5. Its executable
predictions are exposed only as experimental evidence requiring human review.
The output is uncalibrated and must not be described as a validated probability.

See [the execution report](../../../ml/reports/2026-10-05/executable_predictions_report.md).
