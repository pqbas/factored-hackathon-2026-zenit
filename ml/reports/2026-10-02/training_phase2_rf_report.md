# V2 Random Forest Challenger Report

Status: completed on Databricks Serverless environment v4. The challenger is not promoted; final test remains sealed.

## Experiment scope

- Source `workspace.bank_silver.transactions`, Delta version 1; feature set `v2_customer_history`.
- Temporal train: 2,994,597 rows; validation: 743,909 rows with 699 fraud labels (0.0940%).
- Four V1/V2-style baselines and candidates plus one bounded balanced Random Forest were evaluated on the same train/validation split. Final-test rows were excluded.
- No table was written or changed. MLflow contains metrics and aggregate evidence only; model binary logging still requires a writable UC Volume.

## Ranking results

- B0 constant-score areaUnderPR: 0.00093963.
- The Random Forest was the best V2 candidate: areaUnderPR 0.00097447, absolute lift +0.00003484 (3.71% relative).
- Best V1 areaUnderPR was 0.00099421; the V2 forest remains below it by 0.00001974.
- ROC-AUC: 0.504931, near chance. Decision: **no promotion**; the observed point lift is too small to justify operational use or opening test.

| Candidate | areaUnderPR | Fit time (s) |
|---|---:|---:|
| M1_logistic_regression (none) | 0.00092690 | 34.17 |
| M1_logistic_regression (balanced) | 0.00093303 | 27.50 |
| M2_decision_tree (none) | 0.00093963 | 25.52 |
| M2_decision_tree (balanced) | 0.00094708 | 24.79 |
| M3_random_forest (balanced) | 0.00097447 | 36.40 |

## Review budget

- At the tie-preserving score threshold, review rate is 10.00%: 72 true fraud alerts and 74,318 false alerts. Precision is 0.0968%; recall is 10.30%; 627 fraud labels are missed.
- Deterministic top 10% selection finds 72 of 699 fraud labels (recall 10.30%, precision 0.0968%). Random ranking would find about 10% on average. The small difference is not useful evidence.
- Country and channel subgroup metrics and denominators are included in the aggregate JSON. They should not be treated as stable estimates for small groups.

## Conclusion and next step

The bounded Random Forest fit successfully but did not produce enough ranking lift to justify deployment. V1 still has the highest observed areaUnderPR, and both are close to the constant baseline. Do not open the final test for these candidates. V3 digital-event features remain unevaluated because the current principal lacks `SELECT` on `workspace.bank_silver.digital_events`; the exact permission error is documented separately.

Databricks parent run: `d7a5f63e1bfd4287b413945aae2b010b`. Runtime: 398.0 seconds.
