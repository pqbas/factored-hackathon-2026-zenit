# Fraud-Score Alignment in Validation

Status: read-only diagnostic; **not a model result and not an approved real-time rule**. The final-test period was excluded.

## Method

An aggregate query read `workspace.bank_silver.transactions` at Delta version 1 for the validation window `[2025-07-01, 2026-01-01)`. It grouped five `fraud_score` bands against `is_fraud`; it returned counts only. The validation cohort contains 743,909 transactions and 699 fraud labels (0.0940%). No table was written.

| `fraud_score` band | Transactions | Fraud labels | Non-fraud labels |
|---|---:|---:|---:|
| Missing | 149,136 | 137 | 148,999 |
| < 30 | 594,296 | 187 | 594,109 |
| 30–49 | 218 | 116 | 102 |
| 50–69 | 106 | 106 | 0 |
| ≥ 70 | 153 | 153 | 0 |

## Threshold diagnostics

| Threshold | Alerts | Fraud labels among alerts | False positives | Observed precision | Validation fraud captured |
|---:|---:|---:|---:|---:|---:|
| ≥ 30 | 477 | 375 | 102 | 78.62% | 53.65% |
| ≥ 50 | 259 | 259 | 0 | 100% | 37.05% |
| ≥ 70 | 153 | 153 | 0 | 100% | 21.89% |

These very high observed values are also a warning. The model experiments that excluded `fraud_score` were near random, while labels align almost perfectly with high score bands. This could mean `fraud_score` is a strong prior signal, but it could also mean the score was calculated from `is_fraud`, after a fraud decision, or as part of synthetic label generation. The current repository does not establish which explanation is correct.

**Do not put `fraud_score` into the real-time model or claim 100% production precision until its producer confirms it is computed independently and is available before authorization.** If that is confirmed, evaluate the score as an input/baseline on a later untouched temporal period, then assess incremental value from ML features. If it is post-outcome or label-derived, using it is leakage and cannot solve prospective detection.

Notebook: `/Shared/fraud-eda/07_fraud_score_provenance`. Aggregate evidence: [JSON](fraud_score_validation_diagnostic_data.json). The computation is reproducible in [the notebook](../../notebooks/07_fraud_score_provenance.ipynb).
