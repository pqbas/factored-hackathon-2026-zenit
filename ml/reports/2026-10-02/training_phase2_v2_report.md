# Phase 2 V2 Customer-History Training Report

Status: completed on Databricks Serverless environment v4. V2 is not promoted. The final test remains sealed.

## Scope and temporal controls

- Source: `workspace.bank_silver.transactions`, Delta version 1.
- Feature version: `v2_customer_history` (19 predictors).
- Training: 2,994,597 transactions and 3,014 fraud labels, before 2025-07-01.
- Validation: 743,909 transactions and 699 fraud labels, through before 2026-01-01.
- Final-test rows were excluded before history-feature construction. The Delta source remained read-only; no source or output tables were written.
- History features use same-customer transactions strictly earlier than the current timestamp. Equal timestamps and future rows are excluded. Amount history uses the same currency and requires at least five prior rows; missing customer IDs do not share a history group.
- Imputation and categorical encoding were fitted on training only; no sampling was applied.

## Validation ranking results

Primary metric is Spark `BinaryClassificationEvaluator.areaUnderPR`. This report uses that metric name and does not equate it with scikit-learn average precision.

- Constant-score baseline: 0.00093963 (validation prevalence 0.0940%).
- Best V2 candidate: `M2_decision_tree` with `{"class_weight": "balanced", "max_depth": 5, "min_instances_per_node": 1000, "seed": 42}`; areaUnderPR 0.00094708, absolute lift over B0 +0.00000745 (+0.79% relative).
- ROC-AUC for the selected candidate: 0.500889, near chance.
- V1 best areaUnderPR was 0.00099421; V2 is lower by 0.00004713. The new behavioral features did not improve the best V1 ranking result.
- Decision: **do not promote V2**. Its point estimate is only marginally above B0, its ROC-AUC is near 0.5, and its operating metrics do not show useful ranking.

| Candidate | areaUnderPR | Fit time (s) |
|---|---:|---:|
| M1_logistic_regression (none) | 0.00092690 | 33.45 |
| M1_logistic_regression (balanced) | 0.00093303 | 26.63 |
| M2_decision_tree (none) | 0.00093963 | 25.18 |
| M2_decision_tree (balanced) | 0.00094708 | 24.28 |

## Review-capacity results

- A score threshold preserving complete ties flags 46,859 rows (6.30%, below the assumed 10% cap because of a large tied-score group): 36 fraud and 46,823 non-fraud. Precision 0.0768%; recall 5.15%; missed fraud 663.
- Deterministic top 10% ranking flags 74,391 and finds 63 positives (recall 9.01%). This top-k breaks score ties using transaction_id for deterministic counting; tie membership is not meaningful risk ordering.
- Country and channel subgroup counts and denominators are included in the JSON evidence. Small groups should not be interpreted as stable rates.

## Interpretation and next work

V2 customer-history features did not improve on the V1 best candidate in this validation split. The dataset may still contain useful signals, but these two feature sets do not establish them. The next low-risk step is a read-only coverage audit of the documented `digital_events` table (prior-event coverage and label rates with denominators). Only implement and train V3 if enough transactions have causally prior digital events to support an evaluation. Keep the final test sealed.

## Artifact limitation

MLflow logs metrics and aggregate JSON evidence. A loadable Spark model binary remains unavailable because this principal lacks a writable Unity Catalog ML staging Volume; the Bronze checkpoint Volume was not reused. The logged model specification is descriptive, not executable.

Databricks parent run: `6cb1c0fb60b54bb78a215991a56e3b0e`. Total notebook runtime: 281.0 seconds.
