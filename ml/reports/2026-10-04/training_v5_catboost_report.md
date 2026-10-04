# V5 CatBoost capacity and precision challenger

Status: **completed, not promoted**. CatBoost changed the model family and removed the previous 1,000-row leaf constraint, but did not produce useful later-period precision. No final-test rows were read and no source, scoring, or serving database objects were written.

## Execution and reproducibility

- Databricks run: `457664911930657`; task: `335214729733534`, successful.
- Shared notebook: `/Shared/fraud-eda/09_catboost_challenger`.
- Source code commit: `1589f08`; [trainer](../../train_v5.py), [feature builder](../../train_v4.py), [one-time run configuration](../../jobs/train_v5.json).
- MLflow experiment: `/Shared/fraud-eda/phase5-catboost-challenger`; parent run: `fe15f8d5ec4749ca9eb3668cca3f2d22`.
- Environment: Serverless v4, CatBoost 1.2.8. Main trainer runtime: 179.65 seconds, excluding setup and preliminary notebook fixtures. No measured monetary cost is available.
- Source: `workspace.bank_silver.transactions`, pinned Delta version 1. Timestamp processing uses UTC; the original source timezone remains unconfirmed.
- A toy smoke test initially failed because `use_weights=false` was specified without nondefault object/class weights. It was corrected before banking-data training. Initial run `543108204583001` failed; serverless retried despite the requested zero task retries. The successful run above is the corrected submission.
- Local policy/feature tests: **61 passed**. Spark fixture assertions checked same-time exclusion, the inclusive history lower bound, and exclusion of sealed-test rows. The corrected native CatBoost toy compatibility test also passed before the actual experiment. Toy outcomes are not model-quality evidence.

Exact aggregate metrics and memory checks: [JSON evidence](training_v5_catboost_data.json). Checked-in notebooks keep outputs empty.

## Population and selection protocol

| Period | Transactions | Fraud labels | Role |
|---|---:|---:|---|
| Before 2025-01-01 | 2,271,707 | 2,296 | Feature preprocessing and model fitting |
| January–March 2025 | 356,361 | 344 | Early stopping and candidate selection |
| April–June 2025 | 366,529 | 374 | Operational threshold selection |
| July–December 2025 | 743,909 | 699 | Exploratory evaluation at frozen thresholds |

The fit population was reduced to **229,760 rows**: all 2,296 positive labels and a deterministic 10% hash sample of negatives. Sampled negatives received inverse inclusion weight 10; positive rows received 1 before the candidate's class weight. Evaluation retained all rows and natural prevalence. Median imputation was fitted on sampled fit rows. Categorical inputs were ordered chronologically and handled natively. IDs were used only for sampling, history, and ordering, and removed before driver collection.

V5 reused the V4 predictor definitions and added missingness/support flags in C3. Compared with earlier experiments, training population, fit cutoff, preprocessing, and model family differ. These are candidate comparisons, not an isolated causal estimate of the algorithm's effect. Internal periods were previously used in older model training; July–December was inspected by multiple experiments. They are not fresh independent holdouts. The 2026 final test remains sealed.

## Candidate results

All four sequential candidates used depth 6, learning rate 0.05, L2 leaf regularization 10, at most 500 iterations, and early stopping after 50 non-improving rounds. Selection used unweighted scikit-learn average precision on January–March, not final-test data. Train estimates used inverse sampling weights and are explicitly estimates for a sampled fit cohort.

C3, with positive-class weight 20 and missingness/support flags, was selected. It retained 33 iterations. Its candidate-selection AP was 0.00112997 and ROC-AUC was 0.5329. Its inverse-weighted training AP estimate was 0.00154393 and training ROC estimate 0.5904. These training/selection signals did not persist in the later exploratory period.

Later-period **average precision was 0.00097231**, versus prevalence 0.00093963; **ROC-AUC was 0.5038**. The selected model produced 444,863 distinct scores, so it did not have V4's constant-score failure. Its ranking nevertheless remained near chance.

Spark areaUnderPR used in V1–V4 and scikit-learn average precision used here are different definitions; do not rank candidates directly by those reported numbers without recomputing a common metric. Precision and recall below refer to the same July–December cohort as earlier reports, with different threshold-selection procedures.

## Precision at frozen thresholds

Thresholds were selected on April–June and frozen before scoring July–December. Later alert rates may drift above or below their selection-period budgets.

| Budget used to choose threshold | Actual later alerts | Fraud found | False positives | Precision | Recall |
|---:|---:|---:|---:|---:|---:|
| 0.1% | 742 | 1 | 741 | 0.135% | 0.143% |
| 0.5% | 3,724 | 6 | 3,718 | 0.161% | 0.858% |
| 1% | 7,468 | 12 | 7,456 | 0.161% | 1.717% |
| 2% | 14,988 | 17 | 14,971 | 0.113% | 2.432% |
| 5% | 37,067 | 36 | 37,031 | 0.097% | 5.150% |
| 10% | 73,930 | 77 | 73,853 | 0.104% | 11.016% |

At the 1% operating point, V5 found **12 fraud labels among 7,468 alerts**. Earlier V2's descriptive top-1% result was **12 among 7,440** (0.161%). V5 does not show an improvement at this operating point. At approximately 10% review, V5 found 77 compared with V2's 72, but that small descriptive difference, under different threshold procedures and training cohorts, is not evidence of a practically useful improvement.

The frozen 1% threshold produced only 12 positives across six months. The JSON includes monthly denominators and a fixed-seed 2,000-replicate month-block resampling summary. With only six exploratory month blocks, this is descriptive variability, not a reliable production confidence interval or evidence for promotion. No customer-level bootstrap or final-test uncertainty analysis was performed.

## High-precision targets and decision

No threshold on the designated operating period satisfied **20%, 50%, or 80% precision** together with at least 100 alerts, recall at least 20%, and alert rate at most 1%. The scenarios are reported as infeasible, rather than assigning zero alerts a perfect precision. No high-precision threshold was sent to later evaluation.

**Do not deploy V5 for automatic fraud decisions or describe it as an improved high-precision model.** The capacity/encoding experiment completed successfully but failed its usefulness objectives. Source label provenance, label maturation, and field availability before authorization remain unresolved, independent of the metric failure.

A new read-only check on 2026-10-04 again returned `INSUFFICIENT_PERMISSIONS` for `workspace.bank_silver.digital_events`, SQL state `42501`, statement `01f1c042-f7af-1eab-a705-e62689b3ba5f`. The next material experiment needs approved prior digital signals and verified label generation. Continuing a broad parameter sweep on the same fields and repeatedly inspected validation is not supported by this evidence.

No model binary was logged, registered, or served. Shared source notebooks and aggregate MLflow experiment artifacts were created/updated; source tables, schemas, UC functions, data volumes, and agent/web deployment were not changed. The branch changes remain local until explicitly pushed.
