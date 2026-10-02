# Requirements: fraud risk model

Status: specified, pending implementation and data validation. Date: 2026-09-28.

## 1. Objective and scope

Produce a reproducible fraud score per transaction by comparing models on the same temporal dataset. Agent policy will decide whether to escalate a case; the model will not block cards or move money.

Source: `workspace.bank_silver.transactions`. Unit: `transaction_id`. Label: `is_fraud` from the organizer's synthetic dataset. Do not create labels from `fraud_score`. Do not present offline performance as a production improvement.

First version: batch training, evaluation, and MLflow artifacts. Model registration, score tables, and agent integration belong to later phases. Streaming and online endpoints are not required.

## 2. Models and comparison order

These are defined experiment candidates; there is no winner yet.

| ID | Model | Role | Rationale |
|---|---|---|---|
| B0 | Constant predictor: training prevalence | Ranking/probability baseline | Measures signal against an uninformative score. |
| B1 | Always non-fraud classifier | Operational baseline | Exposes misleading accuracy and zero recall with imbalanced classes. |
| M1 | Regularized logistic regression | Required comparator | Simple model to measure the value of linear relationships. |
| M2 | Decision tree | Initial primary candidate | Interpretable; exposes rules and nonlinear relationships. |
| M3 | Random Forest | Challenger after M1/M2 | Tests whether an ensemble of trees improves generalization. |
| M4 | HistGradientBoostingClassifier | Optional challenger | Tests boosting if early results and budget justify added complexity. |

Required MVP: B0, B1, M1, and M2. M3/M4 do not block the first delivery. Neural networks, LLMs, and unsupervised detectors are outside this version: a label exists and we first need a controlled tabular comparison. LightGBM/XGBoost are outside the initial scope to limit dependencies and experiments.

Proposed implementation: scikit-learn for models and MLflow for tracking, provided the prepared dataset fits comfortably in available compute. Do not run `toPandas()` on the entire source without estimating size. If Spark ML is needed, record the decision and update this specification; do not silently change algorithms or population.

## 3. Data and feature contract

- R1: one row per transaction_id; no repeated IDs across splits.
- R2: isolate and count rows with missing/invalid PK, timestamp, or label. Do not impute is_fraud. If an evaluation partition lacks either class, stop selection and review the design before opening the final test.
- R3: verify all transaction types and positives per type. Initially include all valid transactions; a later debit filter requires a new version and explicit denominators.
- R4: V1 features: amount, currency, amount_usd (if validated), log1p(abs(amount)), sign, transaction_type, channel, merchant_category, transaction_country, hour, weekday, and weekend flag.
- R5: V2 adds strictly earlier history: 1h/24h/7d counts, compatible historical amounts, time since the previous transaction, and new merchant/country indicators. Coordinates and speed are optional after quality checks.
- R6: V3 (customers/products/digital_events) is deferred until temporal availability is established. Snapshot country and segment are not assumed historical.
- R7: exclude is_fraud, fraud_score, transaction_status, response_code, process_date, subsequent outcomes, current states/balances, and personal identifiers from predictors. Keep IDs for provenance and history, separate from X.
- R8: windows are [T - duration, T), excluding all events at T. Joins must preserve uniqueness; aggregate digital events before joining.
- R9: explicitly handle unknown categories and missing values using rules learned on train. Never fit imputers, vocabularies, scaling, or feature selection on validation/test.

Full inventory and relationships: [data map](../../data_map_and_features.md). Using all 13 tables is not required: the first model starts with transactions.

## 4. Evaluation protocol

Proposed boundaries, subject to volume and positive-count checks:

- Train: transaction_date < 2025-07-01.
- Validation: 2025-07-01 <= transaction_date < 2026-01-01.
- Final test: transaction_date >= 2026-01-01, through the fixed dataset end.

Preserve natural prevalence in validation/test. Apply weights or undersampling to train only. Report original size, used size, positives, and sampling fraction. Candidates share preprocessing conventions, seed, and split. Earlier events without future labels may supply validation/test history; never use test labels as features.

Primary metric: **average precision (AP)**, identified by name and method; do not confuse it with trapezoidal PR-curve integration. Additional metrics: ROC-AUC when both classes exist, precision, recall, F1, TP/FP/TN/FN, review rate, and recall at 5/10/20% review budgets. Report metrics as undefined where appropriate when there are no positives or positive predictions; do not hide these cases.

Initial review capacity: **10% as an experiment assumption**, not actual bank capacity. On validation, choose the threshold with the highest recall that does not exceed this budget, accounting for tied scores. Separately report recall@top-k with deterministic transaction_id tie-breaking; do not claim it is equivalent to a fixed threshold. Distribution shift may exceed the budget on test: measure this rather than retuning the threshold on test.

Selection: compare validation AP; an absolute improvement <= 0.001 is initially treated as a practical tie, favoring lower cost and complexity. This tolerance is an experiment decision, not statistical significance. Document changes before accessing test. If the candidate does not beat B0 or captures no positives within budget, conclude with a negative result and do not promote it.

Evaluate uncertainty using customer-level bootstrap on test for AP and recall; record seed, valid replicates, and strata without positives. Present country/channel and seen/unseen customer results with denominators; do not use accent as a predictor. Measure training time, scoring time, resources, and cost where measurable; do not invent zero cost.

## 5. Score, calibration, and actions

The score will be between 0 and 1, but named `fraud_risk_score`, not calibrated probability. Class weights, sampling, and small leaves may distort probabilities.

Calibration is not required for MVP. If introduced, reserve a calibration period before training, separate from threshold selection and test; compare Brier score and calibration curves with sufficient support. Do not fit and evaluate the calibrator on the same rows.

Do not use is_fraud at inference. fraud_score >= 70 may appear as a separate, potentially contaminated diagnostic; it is neither a clean baseline nor an automatically accepted fallback. Missing/invalid scores produce `unavailable` and review according to agreed policy, never zero risk.

## 6. Tracking and output contracts

MLflow must record: run_id, code hash, spec/feature version, Delta versions per table, filters, dates, seed (42 by default), libraries, preprocessing, parameters, weights/sampling, metrics with denominators, threshold, budget, and failures. Artifacts: data report, curves, confusion matrix, model comparison, and M2 tree rules. Importances/coefficients are not causal explanations.

Proposed outputs, not yet created:

| Field | Type | Rule |
|---|---|---|
| transaction_id | STRING | Transaction key, not a predictor. |
| fraud_risk_score | DOUBLE nullable | [0,1] when score_status = ok; NULL when unavailable. |
| score_status | STRING | ok or unavailable. |
| model_version | STRING | Immutable version; a champion alias is insufficient. |
| feature_version | STRING | Feature contract identifier. |
| scored_at | TIMESTAMP | UTC inference timestamp. |
| training_cutoff | TIMESTAMP | Exclusive training data cutoff. |
| run_id | STRING | MLflow training run. |

Proposed development storage: `workspace.bank_ml`; specific permissions will be required. Scoring table: `transaction_risk`, key (transaction_id, model_version, feature_version); reruns must be idempotent. Define the gold consumption view during integration. Do not overwrite source tables. Distinguish retrospective demonstration scores from temporal out-of-sample predictions.

## 7. Dependencies and open decisions

- Silver read access was confirmed on 2026-10-02; the EDA notebook completed on Databricks serverless against Delta version 1.
- Confirm training compute for scikit-learn model fitting: successful Spark EDA execution does not establish memory/runtime compatibility for model training.
- Verify is_fraud origin/maturation, learnable signal, timezone, and USD conversion.
- Confirm memory/CPU and set a runtime budget before launching challengers.
- Obtain write permissions on an isolated ML schema and model registration permissions before deploying outputs.

This specification is the reference for new implementations; [the earlier proposal](../../../docs/ml_fraud_model_proposal.md) remains background material. An experimental delivery can be valid even if the dataset cannot support a useful model; promotion and integration require favorable evidence.
