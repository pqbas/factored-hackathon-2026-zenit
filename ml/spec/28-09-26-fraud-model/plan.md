# Plan: fraud risk model

Status: Phases 0/1, EDA, and V1–V4 exploratory validation are complete. No model is promoted; V4 assigned a constant score to all validation rows. A validation-only `fraud_score` diagnostic showed unusually strong label alignment, but timing/provenance is unknown. `digital_events` remains blocked on SELECT; the final test remains sealed. See dated reports in `../../reports/2026-10-03/`.

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
| M3 Random Forest | Proposed broader grid: n_estimators: 200; max_depth: 8, 16; min_samples_leaf: 100, 1000; max_features: sqrt; class_weight: balanced_subsample. Executed one bounded challenger: 20 trees, depth 6, minimum 1,000 rows per leaf, balanced weights. | 4 proposed |
| M4 HistGradientBoosting, optional | max_iter: 200; learning_rate: 0.05, 0.1; max_leaf_nodes: 15, 31; min_samples_leaf: 100; l2_regularization: 1 | 4 |

B0/B1 require no search. Leaf sizes are starting points for the reported volume; revisit them before using test if sampling changes. Verify parameter support in the installed version during implementation and pin dependencies. M4 starts without weights; record this difference in comparisons. Bound parallelism by available resources rather than using all cores by default. Do not automatically execute all 26 combinations: first run a train-only smoke test and estimate the budget.

Log all attempts, including failures and non-convergence. Do not accept an unconverged M1 as a definitive result. Select the winner and threshold using validation only. Freeze configuration before the next phase. The train-only Spark ML smoke test passed on Databricks Serverless environment v4; its runtime estimate is recorded in `../../reports/2026-10-02/training_smoke_report.md`. Because Serverless does not support explicit DataFrame persistence, the first full pass is bounded to two M1 variants (unweighted/balanced at C=1) and two conservative M2 variants (unweighted/balanced, depth 5, leaf size 1,000). Expand tuning after evidence shows enough runtime/compute headroom.

## Phase 3 — Final evaluation

Run the selected candidate and baselines once on test. Report AP, curves, confusion matrix, recall/budget, intervals, and subgroups. Reserve subsequent challengers/features for a new version with a protocol that avoids turning the current test into validation.

Explicit decision: useful candidate, insufficient evidence, or no improvement. Do not force a champion.

## Phase 4 — Feature iterations and challengers

V1–V4 transaction, customer-history, transaction-category, coarse-location, merchant-familiarity, and customer-location challengers are complete; none supports promotion. The V4 selected model assigned a constant score to every validation row. The `fraud_score` alignment diagnostic must remain separate until its timing and independence are established. The digital-event coverage audit is prepared but blocked because the active principal lacks `SELECT` on `workspace.bank_silver.digital_events`. Do not continue tuning the same validation period as if it were a fresh holdout; first verify label provenance and get access to approved pre-decision signals.

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


### Phase 2 outcomes (2026-10-02)

Four bounded M1/M2 candidates completed for V1 and V2. A bounded V2 Random Forest challenger also completed. V1's best areaUnderPR was 0.000994; the V2 forest reached 0.000974 versus the constant-score baseline of 0.000940, with ROC-AUC 0.501 and top-10% recall 10.3%. No model is promoted and test remains unopened. Full evidence: `../../reports/2026-10-02/training_phase2_report.md`, `../../reports/2026-10-02/training_phase2_v2_report.md`, and `../../reports/2026-10-02/training_phase2_rf_report.md`.
