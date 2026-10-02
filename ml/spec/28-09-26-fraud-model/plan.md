# Plan: fraud risk model

Status: Phases 0/1 and EDA are complete; Phase 2 implementation is in progress. See the dated training report for execution evidence.

## Phase 0 — Access and profiling

Verify silver SELECT and Python execution on available compute. Measure sizes before choosing materialization. Pin Delta versions and export only quality aggregates, not customer records, to the repository.

Deliverable: report of rows, positives/prevalence by month, type, country, and channel; duplicates, missing values, categories, ranges, dates, and coverage. Check leakage and chronology. Decide final scope/splits/features and compute budget.

## Phase 1 — V1 features and partitions

Implement the contract and causal transformations; separate IDs, label, and X. Record excluded columns. Build splits and persist a version/count manifest. For M1, impute/scale numerical features and encode categorical features; for M2/M3, document categorical encoding without imposing an arbitrary order. Learn categories on train only and handle unknown values.

Before training, measure transformed representation memory; high-cardinality one-hot encoding can dominate size. For M4, define a pipeline compatible with its representation and category limits, without densifying a huge matrix before estimating memory. Defer M4 if it does not fit.

## Phase 2 — Model MVP and MLflow

Shared seed: 42. Bounded tuning on fixed temporal validation, not random cross-validation. Proposed initial configuration:

| Model | Initial search space | Maximum combinations |
|---|---|---|
| M1 logistic regression | C: 0.1, 1, 10; class_weight: None, balanced; L2 penalty; maximum 1000 iterations | 6 |
| M2 decision tree | max_depth: 3, 5, 8; min_samples_leaf: 100, 1000; class_weight: None, balanced | 12 |
| M3 Random Forest, later | n_estimators: 200; max_depth: 8, 16; min_samples_leaf: 100, 1000; max_features: sqrt; class_weight: balanced_subsample | 4 |
| M4 HistGradientBoosting, optional | max_iter: 200; learning_rate: 0.05, 0.1; max_leaf_nodes: 15, 31; min_samples_leaf: 100; l2_regularization: 1 | 4 |

B0/B1 require no search. Leaf sizes are starting points for the reported volume; revisit them before using test if sampling changes. Verify parameter support in the installed version during implementation and pin dependencies. M4 starts without weights; record this difference in comparisons. Bound parallelism by available resources rather than using all cores by default. Do not automatically execute all 26 combinations: first run a train-only smoke test and estimate the budget.

Log all attempts, including failures and non-convergence. Do not accept an unconverged M1 as a definitive result. Select the winner and threshold using validation only. Freeze configuration before the next phase. The train-only Spark ML smoke test passed on Databricks Serverless environment v4; its runtime estimate is recorded in `../../reports/2026-10-02/training_smoke_report.md`. Because Serverless does not support explicit DataFrame persistence, the first full pass is bounded to two M1 variants (unweighted/balanced at C=1) and two conservative M2 variants (unweighted/balanced, depth 5, leaf size 1,000). Expand tuning after evidence shows enough runtime/compute headroom.

## Phase 3 — Final evaluation

Run the selected candidate and baselines once on test. Report AP, curves, confusion matrix, recall/budget, intervals, and subgroups. Reserve subsequent challengers/features for a new version with a protocol that avoids turning the current test into validation.

Explicit decision: useful candidate, insufficient evidence, or no improvement. Do not force a champion.

## Phase 4 — Feature iterations and challengers

Evaluate V1 versus V1+V2 on temporal validation periods before test, holding the rest of the protocol constant. M3 follows M1/M2 results; M4 requires budget and compatibility. Record marginal gain and cost. This phase must precede opening test for the corresponding version, even though it is listed as the next MVP iteration.

## Phase 5 — Scoring and integration

Only with evidence and permissions: register a version, create output in bank_ml, and implement an idempotent batch scorer. Validate the score contract and ensure failures do not produce zero risk. Agree on the consumption view and policy with the agent team; do not automatically modify the existing dispute workflow. Measure latency/cost and define score expiration before enabling consumption.

## Planned structure (not yet implemented)

```text
ml/
├── config/fraud.yaml        # sources, boundaries, features, seed, and budget
├── profile.py              # checks and aggregate report
├── features.py             # V1/V2 features with a temporal contract
├── train.py                # pipelines, baselines, and models
├── evaluate.py             # metrics, threshold, and report
├── score.py                # batch inference, later phase
├── databricks.yml          # jobs after compute validation
├── tests/                  # causal contracts and critical failures
└── spec/                   # decisions, plan, and validation
```

Phase 2 training uses a one-time serverless notebook run; it does not create a saved job, write tables, register a model, or score final-test rows.
