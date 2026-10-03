# Phase 2 Fraud Model Training Report

Status: V1 comparison completed on Databricks Serverless environment v4. No candidate is promoted. The final test remains sealed.

## Scope and controls

- Source: `workspace.bank_silver.transactions` at Delta version 1.
- Training rows: 2,994,597 (3,014.0 fraud), before 2025-07-01.
- Validation rows: 743,909 (699.0 fraud), from 2025-07-01 through before 2026-01-01.
- The final-test period was excluded before feature construction. No source table was created, changed, or deleted; no transaction-level predictions were persisted.
- Preprocessing was fitted on training rows only. Validation retained natural prevalence; no sampling was applied.

## Ranking results

Primary metric is Spark `BinaryClassificationEvaluator.areaUnderPR` (not scikit-learn average precision). The constant-score baseline equals validation prevalence.

- B0 areaUnderPR: 0.00093963 (validation prevalence 0.0940%).
- Highest-scoring candidate: `M2_decision_tree` with `{"class_weight": "balanced", "max_depth": 5, "min_instances_per_node": 1000, "seed": 42}`; areaUnderPR 0.00099421; absolute lift +0.00005458 (+5.81% relative).
- Validation ROC-AUC for that candidate: 0.492354.
- Decision: **do not promote V1**. The measured gain over B0 is small and there is not enough evidence to justify consuming the sealed final test.

| Candidate | areaUnderPR | Fit time (s) |
|---|---:|---:|
| M1_logistic_regression (none) | 0.00092238 | 23.60 |
| M1_logistic_regression (balanced) | 0.00092965 | 16.57 |
| M2_decision_tree (none) | 0.00093963 | 15.99 |
| M2_decision_tree (balanced) | 0.00099421 | 14.69 |

## Review-capacity interpretation

- The initial run's broad practical-tie rule selected unweighted logistic regression for threshold diagnostics (areaUnderPR 0.00092238, below B0). At its 10% review threshold: 62 true fraud alerts, 74,328 false alerts, 668,882 true negatives, and 637 missed fraud; precision 0.0833%, recall 8.87%, review rate 10.00%. These operating metrics do not describe the best-areaUnderPR tree candidate.
- The top-k views and country/channel subgroup denominators are available in the aggregate JSON evidence. These are validation diagnostics, not operating guarantees.
- Class imbalance makes raw accuracy uninformative; a 10% review policy must find materially more than the random-ranking expectation (about 10% recall) to be useful.

## Interpretation and next work

The V1 transaction attributes did not produce a persuasive ranking signal. This does not establish that the dataset has no predictive signal. The next experiment adds only strictly earlier same-customer transaction history: transaction counts over 1h/24h/7d, elapsed time since the previous transaction, and a 30-day amount ratio against prior transactions in the same currency. Equal-timestamp, future, and other-customer records are excluded. Compare V2 on the same temporal validation split; keep the final test unopened until a candidate clears a documented usefulness gate.

## Artifact and runtime limitations

MLflow contains run metrics and bounded aggregate evidence. A loadable Spark model binary was not logged because this principal has no writable Unity Catalog ML staging Volume; the existing Bronze checkpoint volume was not reused. The model specification is descriptive and is not deployable.

Databricks parent run: `b5515db9fe834a57aa55adf88d3d684b`. Total notebook runtime: 305.4 seconds.
