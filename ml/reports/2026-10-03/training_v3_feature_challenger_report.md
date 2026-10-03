# V3 Pre-Decision Feature Challenger

Status: completed validation-only experiment. **Not promoted.** No final-test rows were read and no source or scoring table was written.

## Experiment

- Source: `workspace.bank_silver.transactions`, Delta version 1.
- Training: 2,994,597 rows, 3,014 fraud labels, before 2025-07-01.
- Validation: 743,909 rows, 699 fraud labels (0.0940%), from 2025-07-01 through 2025-12-31.
- Features: V2 causal customer-history features plus `transaction_category`, one-decimal rounded latitude/longitude, and a location-availability flag.
- Excluded: `is_fraud` as a predictor, `fraud_score`, `transaction_status`, `response_code`, processing metadata, and identifiers. Raw coordinates were not model predictors.
- Preprocessing was fitted on train only; validation kept its natural class prevalence.
- Notebook: `/Shared/fraud-eda/05_feature_challenger`.
- Databricks run: `827896118496345`; MLflow experiment: `/Shared/fraud-eda/phase3-feature-challenger`; parent run: `ef4218aa133c468a8a0899e92eb80019`.

## Results

The best candidate within V3 was a class-weighted Random Forest (20 trees, depth 6, minimum leaf size 1,000). Its Spark `areaUnderPR` was **0.00094095**, versus the validation prevalence baseline **0.00093963**. The absolute gain was 0.00000132 (about 0.14% relative); ROC-AUC was **0.5088**, still near random ranking.

| Review capacity | Rows reviewed | Fraud found | Recall | Precision | Random-review precision |
|---:|---:|---:|---:|---:|---:|
| 0.1% | 744 | 1 | 0.14% | 0.134% | 0.094% |
| 0.5% | 3,720 | 1 | 0.14% | 0.027% | 0.094% |
| 1% | 7,440 | 4 | 0.57% | 0.054% | 0.094% |
| 2% | 14,879 | 13 | 1.86% | 0.087% | 0.094% |
| 5% | 37,196 | 32 | 4.58% | 0.086% | 0.094% |
| 10% | 74,391 | 63 | 9.01% | 0.085% | 0.094% |
| 20% | 148,782 | 144 | 20.60% | 0.097% | 0.094% |

At a 10% score threshold, the model flagged 74,389 transactions, found 63 frauds, and missed 636 of 699. This is not a useful automatic decision rule.

## Comparison and decision

Adding transaction category and coarse location **did not improve the model**. Compared with the previous V2 Random Forest on the same validation period, V3 had lower areaUnderPR (`0.00094095` vs `0.00097447`), fewer frauds in the top 1% (4 vs 12), and lower precision in the top 10% (0.0847% vs 0.0968%). The isolated gain over constant ranking is tiny and is not evidence of practical lift.

Do not promote V3 or claim real-time suitability. Choosing a different threshold cannot create ranking signal. The best next data test is the prepared `digital_events` audit, but it remains blocked on `SELECT` for `workspace.bank_silver.digital_events`. Separately verify how `is_fraud` was generated and when labels mature: existing project notes say earlier dummy labels were random, while the current snapshot's origin is not yet established. A classifier cannot reliably predict labels that have no relationship to information available at decision time.

Keep the final test sealed until a candidate clears a pre-agreed usefulness gate on temporal validation and the label has an operational definition. If the permitted real-time data and verified labels contain no signal, a high-precision model is not attainable from this dataset; obtain richer pre-authorization features or labeled historical decisions instead of lowering the standard or using post-outcome fields.
