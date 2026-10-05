# Executable transaction predictions: V7

V7 is a serving-compatible CatBoost trained on existing
`workspace.bank_gold.customer_transactions VERSION AS OF 1`. It uses the
frozen V5 C3 parameters with geographic predictors removed because the existing
Gold/Lakebase serving table has no coordinates. It is an executable experimental
model, not a promoted detector or an improvement in measured precision.

Training notebook: `/Shared/fraud-eda/11_executable_fraud_predictions`.
Databricks run: `1029482291508951`; task: `1105616283771884`.
MLflow experiment: `/Shared/fraud-eda/phase7-executable-serving`.
MLflow run: `663c44e0c3de40718830f5362dce5a9b`. Training code commit: `385f34e`.
The native model is 41,248 bytes; its manifest includes source hashes and SHA-256.

| July–December 2025 validation | Result |
| --- | --- |
| Transactions / labeled frauds | 743,909 / 699 |
| Average precision / ROC-AUC | 0.00106606 / 0.496829 |
| Frozen operating threshold | 0.042594873940121264 |
| Alerts / true positives / false positives | 7,224 / 6 / 7,218 |
| Precision / recall | 0.083056% / 0.858369% |

The threshold was frozen using April–June 2025 and approximately a 1% review
budget. Medians and categorical normalization use fit data only. Training
retains all fit positives and samples 10% of negatives deterministically, with
inverse inclusion weights and the fixed class weight. Scores are uncalibrated.
Final-test labels were not read. Native save/reload prediction error was 0.0.
The shared scalar vector matched the training matrix on 32 fit rows.

The original complaint workflow computes inference after a bank-verified charge
is confirmed for handoff. `get_transaction_risk` also accepts an owned transaction
reference; its customer identity comes from the authenticated session, outside
LLM arguments. The query reads existing Lakebase transactions and strictly prior
customer history, with inclusive lower window bounds and currency-specific amount
aggregates. Fraud labels, existing scores, status and processing date are absent
from the inference SELECT and predictor allowlist.

The native artifact returns a real score and frozen-threshold classification.
`review_required` is always true; `automatic_decisions_enabled` is always false.
Missing or ambiguous owned rows, failed queries and invalid model files return
an unavailable result without inventing a score. The original advisor card
shows an experimental index out of 100 and whether the threshold was exceeded,
with explicit human review wording.

A read-only production Lakebase probe generated a real score and rejected a
cross-customer lookup. No source rows, credentials or customer identifiers are
included in this report. Existing source tables, schemas and permissions were
not modified; training created its own notebook/job run and MLflow experiment.

Serving freshness follows the existing Lakebase mirror, currently documented
as manually refreshed. This is synchronous inference over stored transactions,
not interception of live payment authorization. Event-time features do not
reconstruct processing-time knowledge for late arrivals. Label provenance and
original event timezone remain unverified.

Both existing AWS services now run the experimental inference image. See
[deployment verification](aws_predictions_report.md) and aggregate evidence.
