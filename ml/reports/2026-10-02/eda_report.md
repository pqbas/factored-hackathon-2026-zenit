# Fraud EDA execution report — 2026-10-02

## Execution record

- **Notebook:** `/Users/diegoalonsorv02@gmail.com/fraud-eda/01_fraud_eda`
- **One-time run:** `65077500767968`; **task run:** `1088669289855459`
- **Result:** SUCCESS; notebook execution time 67000 ms.
- **Compute:** Databricks serverless. No classic cluster is active.
- **Source:** `workspace.bank_silver.transactions`, Delta version 1.
- **Spark:** 4.2.0; session timezone `Etc/UTC`.
- **Scope:** full-snapshot integrity; feature exploration restricted to train. Aggregated run payload is complete (`truncated=false`).
- **Run page:** https://dbc-184e79fe-04dc.cloud.databricks.com/?o=7474647867986650#job/851109356293280/run/1088669289855459.

The EDA code only reads the pinned Delta snapshot. No table, schema, catalog, view, model, or MLflow experiment was created or changed by the notebook. The one-time run record is retained by the workspace.

## Population and integrity

| Metric | Measured value |
|---|---:|
| Dictionary estimate | 5,000,000 |
| Previous team report | 4,425,008 |
| Rows in pinned snapshot | 4,425,008 |
| Distinct transaction IDs | 4,425,008 |
| Null IDs / excess duplicate rows | 0 / 0 |
| Null labels / null transaction dates | 0 / 0 |
| Fraud labels | 4,316 (0.0975%) |
| Date range in stored timestamps | 2023-06-17 06:01:30 to 2026-06-18 05:59:41 |

This confirms the previous measured count, not the dictionary estimate. It establishes key/label/date completeness for this snapshot; it does not establish that the synthetic fraud labels reflect real-world fraud.

## Temporal split viability

| Split | Rows | Fraud | Prevalence |
|---|---:|---:|---:|
| Train | 2,994,597 | 3,014 | 0.1006% |
| Validation | 743,909 | 699 | 0.0940% |
| Test | 686,502 | 603 | 0.0878% |

Each period contains positive and negative labels. Prevalence is lower in test than train by 0.0128 percentage points. This is an observed difference in the synthetic dataset, not evidence of a real fraud trend. The notebook inspected only test counts and prevalence; it did not use test to choose features or a model.

Within train, monthly prevalence ranged from 0.0811% to 0.1179% across 25 months. Inspect monthly denominators in `eda_data.json` before interpreting small movements.

## V1 feature coverage (train only)

| Feature | Missing in train | Share |
|---|---:|---:|
| `amount` | 0 | 0.00% |
| `currency` | 0 | 0.00% |
| `transaction_type` | 0 | 0.00% |
| `channel` | 0 | 0.00% |
| `transaction_country` | 0 | 0.00% |
| `merchant_category` | 2,297,853 | 76.73% |
| Raw `amount_usd` | 1,716,831 | 57.33% |

Coverage alone does not tell us whether a feature is useful. Keep `merchant_category` as a candidate with an explicit missing category; compare it on validation later. The six populated category values reported in earlier documentation were not recomputed by this notebook.

## Currency normalization

Candidate remains `CASE WHEN currency = 'USD' THEN amount ELSE amount_usd END`.

| Currency | Train rows | Null raw `amount_usd` | Null normalized USD |
|---|---:|---:|---:|
| USD | 1,649,406 | 1,649,406 | 0 |
| COP | 808,287 | 40,384 | 40,384 |
| ARS | 536,904 | 27,041 | 27,041 |

The normalized value is missing for 67,425 train rows (2.25%). The USD-native amount fills the USD rows; missing non-USD conversions remain missing and must not be replaced with local-currency amounts. COP/ARS conversion ratios are narrow and positive in the observed data, but their historical availability and correctness at transaction time have not been verified. Quantiles are in the JSON artifact.

## Leakage precaution

Within train, `fraud_score >= 70` covers 705 rows and all 705 are labeled fraud (100% observed precision in this subset). It covers 23.39% of train fraud positives, so it does **not** identify all fraud cases. Association does not establish the score's provenance, but is sufficient reason to keep it out of predictors until its origin and timing are known.

## Decisions and remaining work

1. Keep the V1 allowlist from `ml/features.py`; exclude `fraud_score`, label, response/status fields, processing date, IDs, and personal information from model predictors.
2. Keep `amount_usd_norm` as a candidate with missing non-USD values left missing; fit any imputation on train only.
3. Keep `merchant_category` as a candidate with explicit missing handling; use validation to test whether it helps.
4. Do not readjust model choices on test. Compare B0/B1 baselines, logistic regression, and a shallow decision tree on validation first.
5. Before training, reconcile Python/SQL feature null edge cases in the implementation, confirm timestamp/timezone semantics, and determine whether temporal splits carry enough stable signal.
6. No fitted preprocessing, training, MLflow run, model registration, score table, or agent integration has been performed.

### Execution attempts

The notebook ran successfully once before an aggregate return cell was added. The first two attempts to return results failed at the final JSON serialization cell (NumPy array conversion and non-finite values); analytical cells had completed. The final run corrected both issues and completed successfully with retries disabled in the submitted task configuration. These failures did not modify data tables.
