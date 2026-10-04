# V6 advanced fraud challenger results

Status: **completed successfully, not promoted**. Seven causal features, weighted XGBoost, per-tree class resampling, novelty detection, and a fixed rank ensemble did not produce useful later-period precision. No final-test rows were evaluated or source database objects modified.

## Execution and reproducibility

- Databricks run: [482234883980497](https://dbc-184e79fe-04dc.cloud.databricks.com/?o=7474647867986650#job/1103274305662947/run/482234883980497); task `745709406567103`, successful on 2026-10-04.
- Shared notebook: `/Shared/fraud-eda/10_advanced_challenger`; helper notebooks `train_v4`, `train_v5`, `train_v6` are adjacent.
- Source commit: `85e6582`; [trainer](../../train_v6.py), [run request](../../jobs/train_v6.json), [specification and research](../../spec/28-09-26-fraud-model/improvement_v6.md).
- MLflow experiment: `/Shared/fraud-eda/phase6-advanced-challenger`; parent run `197e0704e34a4975bc7f7b6e2695e088`.
- Serverless environment v4; XGBoost 2.1.4, imbalanced-learn 0.14.0, scikit-learn 1.6.1.
- Main trainer runtime: 169.03 seconds, excluding preliminary fixture, dependency setup, and smoke test. No measured monetary cost is available.
- Source: `workspace.bank_silver.transactions`, Delta version 1. UTC processing; source timezone and event arrival semantics remain unconfirmed.
- **66 local tests passed**. Successful notebook execution also confirms the independent Python/Spark causal fixture and native XGBoost/forest/isolation toy smoke assertions passed. Toy scores do not establish fraud detection quality.
- [Aggregate JSON evidence](training_v6_advanced_data.json) includes candidate metrics, estimator parameters, actual library versions, memory checks, threshold constraints, monthly counts, and execution identifiers. Checked-in notebook outputs remain empty.

## Features and temporal design

Added product velocity over five minutes and one hour, product same-currency amount sum, customer same-currency amount standard deviation and z-score over 30 days, prior customer activity in the current country, and a new-country indicator. All windows use strictly earlier event times; same-time and future rows are excluded. Amount statistics do not mix currencies. Product/customer IDs are aggregation keys and are removed before collection or training.

| Period | Transactions | Fraud labels | Role |
|---|---:|---:|---|
| Before 2025-01-01 | 2,271,707 | 2,296 | Preprocessing and fitting |
| January–March 2025 | 356,361 | 344 | Early stopping and candidate selection |
| April–June 2025 | 366,529 | 374 | Freeze operating thresholds |
| July–December 2025 | 743,909 | 699 | Later exploratory evaluation |

Fit used 229,760 rows: all positives and the same deterministic 10% negative sample as V5. XGBoost uses inverse inclusion weights before positive-class weighting; the forest uses explicit per-tree resampling. Evaluation retains natural prevalence and all eligible rows. Common fit-only imputation/one-hot preprocessing makes A0/A1 a paired feature comparison. Isolation Forest fits a seeded subset of known normals. The blend uses fixed weights and a fit-only reference distribution.

Candidate/operating periods were previously exposed in model development. Later validation was also inspected repeatedly. These results are exploratory, not independent final-test evidence; 2026 test rows remain sealed. Event-time feature construction alone does not prove online availability, particularly with late data or exchange-rate fields.

## Candidate selection and negative control

| Candidate | Selection average precision | Selection ROC-AUC |
|---|---:|---:|
| A0_xgb_base | 0.00104737 | 0.5210 |
| A1_xgb_enhanced | 0.00108108 | 0.5339 |
| A2_balanced_forest | 0.00107577 | 0.5423 |
| A3_isolation_forest | 0.00095413 | 0.4968 |
| A4_fixed_rank_blend | 0.00107349 | 0.5362 |

A1 enhanced XGBoost was selected by January–March average precision and retained 38 boosting iterations. A1 modestly exceeded A0 on this period, but that gain did not establish useful later ranking. Only the selected candidate was evaluated on July–December; this table is not a later-period performance comparison for every algorithm.

The shuffled-fit-label control produced selection AP 0.00097706 and ROC-AUC 0.5018, compared with genuine A1 AP 0.00108108 and ROC-AUC 0.5339. A1 exceeded this single control on selection, but then fell to operating-period ROC-AUC 0.5013 and later ROC-AUC 0.5023. The control is conditional on the original label-stratified sampled cohort and shares selection-based early stopping. One permutation does not prove labels are random or establish a significance test.

Later average precision was **0.00098223**, versus prevalence **0.00093963**. ROC-AUC was **0.5023**. There were 187,473 distinct scores, so V4's constant-score failure is absent; useful discrimination is still absent.

## Frozen review thresholds

Thresholds were selected in April–June before later scoring. Later alert rates can drift from these budgets.

| Budget used for threshold | Later alerts | Fraud found | False positives | Precision | Recall |
|---:|---:|---:|---:|---:|---:|
| 0.1% | 760 | 1 | 759 | 0.132% | 0.143% |
| 0.5% | 3,761 | 4 | 3,757 | 0.106% | 0.572% |
| 1% | 7,536 | 8 | 7,528 | 0.106% | 1.144% |
| 2% | 14,782 | 20 | 14,762 | 0.135% | 2.861% |
| 5% | 36,826 | 43 | 36,783 | 0.117% | 6.152% |
| 10% | 73,908 | 80 | 73,828 | 0.108% | 11.445% |

At approximately 1% review, **8 of 7,536 alerts were fraud labels**: precision **0.106%**, recall **1.144%**, and 7,528 false alerts. V5 at its frozen approximately 1% threshold found **12 of 7,468**, precision **0.161%** and recall **1.717%**. V6 is descriptively worse at this point. Different model/preprocessing and frozen thresholds prevent interpreting the difference as an isolated algorithm effect. Its slightly higher later AP than V5 is not a useful high-precision improvement.

No operating-period threshold achieved **20%, 50%, or 80% precision** with at least 100 alerts, at least 20% recall, and at most 1% alert rate. No high-precision threshold was manufactured from a few favorable later examples or zero alerts. Numerical raw scores are not calibrated fraud probabilities.

## Monthly support at the frozen 1% threshold

| Month | Transactions | Fraud labels | Alerts | Fraud found | Precision |
|---|---:|---:|---:|---:|---:|
| 2025-07 | 126,882 | 130 | 1,282 | 2 | 0.156% |
| 2025-08 | 126,039 | 119 | 1,243 | 1 | 0.080% |
| 2025-09 | 118,563 | 107 | 1,186 | 2 | 0.169% |
| 2025-10 | 129,268 | 125 | 1,281 | 1 | 0.078% |
| 2025-11 | 120,775 | 103 | 1,280 | 1 | 0.078% |
| 2025-12 | 122,382 | 115 | 1,264 | 1 | 0.079% |

Only one or two positives were found per month. These sparse exploratory counts do not support a stable production claim. No confidence interval or uncertainty test was run for this V6 comparison.

## Decision and next experiment prerequisites

**Do not promote or deploy V6 for automatic fraud decisions.** The advanced techniques were implemented and tested; they did not solve the signal problem. No further broad sweep on the same inputs and inspected validation is justified by these results.

The next distinct hypothesis is earlier digital activity joined to transactions. The last read-only access check on 2026-10-04 failed with SQL state `42501`, statement `01f1c042-f7af-1eab-a705-e62689b3ba5f`. An authorized administrator can grant the following; it was not executed by this experiment:

```sql
GRANT SELECT ON TABLE workspace.bank_silver.digital_events
TO `diegoalonsorv02@gmail.com`;
```

After access is granted, run the existing [coverage notebook](../../notebooks/04_digital_event_coverage.ipynb) before training. Verify available event timestamps, delivery timing, customer coverage, and country/platform/session support. Documented digital event dates alone may be too coarse for a safe before-authorization join. The source dictionary does not promise a device identifier; do not invent one.

Also obtain the organizer's explanation of how `is_fraud` was assigned, when it becomes final, and how `fraud_score` was produced. Ask whether score generation uses the fraud label and whether it exists before authorization. Strong score-label agreement alone cannot authorize using it as a predictor. These are information prerequisites, not additional confirmed permission failures.

For web integration, retain a human dispute workflow and an explicit unvalidated/disabled model state until a candidate demonstrates utility and timing is verified. Do not present a low-quality score as a fraud probability, accuse a person, or use an experimental ranking to block transactions. A validated candidate still needs one frozen final test, persistence, latency/freshness verification, and an identified serving target.

Shared notebook sources and aggregate MLflow artifacts were created/updated. No source/scoring tables, schemas, volumes, UC functions, registry entries, serving endpoints, or web/agent deployments were changed. Git commits remain local; no push occurred.
