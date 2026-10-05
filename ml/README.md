# ML: fraud risk model

Planning area for the fraud-risk model that will support dispute escalation decisions.

Documentation convention: write all new or updated Markdown documentation in English, including diagram labels, tables, and specifications.

Implementation specs: [roadmap](spec/roadmap.md), [requirements and models](spec/28-09-26-fraud-model/requirements.md), [plan](spec/28-09-26-fraud-model/plan.md), and [validation](spec/28-09-26-fraud-model/validation.md). These specs are the current reference for implementation; the data map supplies the schema context.

Start with [Data map and features](data_map_and_features.md): diagrams of all 13 tables and their relationships, candidate features, leakage exclusions, and the initial experiment plan. This is the working document for design iterations.

Earlier proposal: [`docs/ml_fraud_model_proposal.md`](../docs/ml_fraud_model_proposal.md). Persistent schema and access reference: [`docs/fraud_data_reference.md`](../docs/fraud_data_reference.md).

Planned layout:

```
ml/
├── profile.py         # Phase 0 read-only profiling (Implemented ✓)
├── features.py        # Phase 1 V1 feature contract + temporal split (Implemented ✓)
├── validate_features.py  # Phase 1 read-only USD-amount validation (Implemented ✓)
├── train.py           # temporal Spark ML training, validation, and MLflow tracking
├── score.py           # proposed batch scoring -> bank_ml.transaction_risk
├── tests/             # local tests for ml modules
├── reports/           # profiling + feature evidence (Phase 0/1 outputs)
└── databricks.yml     # serverless jobs for training and scoring
```

Status (2026-10-04): **Phases 0 and 1 and exploratory V1–V6 experiments are complete; no ML candidate is suitable for promotion.** V5 CatBoost completed four candidates; later-period ROC-AUC was 0.5038 and precision 0.161% at a frozen approximately 1% review threshold, without useful improvement. V4's selected tree had assigned a constant score. A separate diagnostic found unusually strong alignment between `fraud_score` and `is_fraud`, but its timing/provenance is unknown, so it may be leakage. The `digital_events` audit remains blocked on `SELECT`, rechecked 2026-10-04. Final test remains unopened.

Phase 0 measurements: [reports/2026-09-28/profile_report.md](reports/2026-09-28/profile_report.md)

- **4,425,008 rows** (matches previous team count; dictionary says 5,000,000).
- **4,316 fraud positives (0.0975%)** — severe class imbalance confirmed.
- **Zero null IDs, zero null labels, zero duplicates.**
- **Temporal split viable**: train 2,994,597 (3,014 fraud), val 743,909 (699), test 686,502 (603).
- **fraud_score >= 70 is strongly associated with the label** (999 rows, 100% fraudulent, 0 false positives). Excluded from predictors as a leakage precaution.
- **76.8% of `merchant_category` is null** (only 6 distinct values among 23% populated). Limited signal.
- The smoke test validated Spark ML on Serverless environment v4; the full training workload and quality remain under evaluation.

Phase 1 feature contract: [features.py](features.py), validation [reports/2026-09-28/features_report.md](reports/2026-09-28/features_report.md)

- V1 predictors: `amount`, `currency`, `log_abs_amount`, `amount_sign`, `amount_usd_norm`, `transaction_type`, `channel`, `transaction_country`, `merchant_category`, `hour`, `weekday`, `is_weekend`.
- **Normalized USD amount is viable**: only 2.25% missing (non-USD rows without a conversion), vs 57.3% for raw `amount_usd` (all USD rows lack a conversion because they are already USD). Conversion ratios are internally consistent per currency.
- No fitted preprocessing (imputers/encoders/scalers) in this phase; those are train-only and belong to Phase 2.

## Model training

The train-only compatibility check passed on Serverless environment v4: 29,857 sampled rows, 34 positive labels, logistic regression fit in 12.49 seconds, and a depth-3 decision tree in 4.76 seconds. This validates runtime compatibility only, not model quality. See [the smoke-test report](reports/2026-10-02/training_smoke_report.md).

V1/V2 Phase 2 comparisons and one bounded V2 Random Forest challenger completed as one-time Serverless v4 runs. Best V1 areaUnderPR was 0.000994; the V2 Random Forest reached 0.000974 versus B0 0.000940, with ROC-AUC near 0.5 and top-10% recall 10.3%. No model is promoted. See the [V1 report](reports/2026-10-02/training_phase2_report.md), [V2 report](reports/2026-10-02/training_phase2_v2_report.md), [Random Forest challenger report](reports/2026-10-02/training_phase2_rf_report.md), and aggregate JSON evidence. A read-only `digital_events` audit was attempted but requires `SELECT` on `workspace.bank_silver.digital_events`; the exact access failure is recorded in the [access report](reports/2026-10-02/digital_event_access_report.md). Final test remains unopened. The executable Spark model binary is not logged because this principal has no writable ML staging Volume.

The [review-budget curve](reports/2026-10-03/review_budget_curve_report.md) shows V2 performance at different review capacities. The [V3 challenger](reports/2026-10-03/training_v3_feature_challenger_report.md) tested transaction category and coarse location and was worse than V2. The [V4 challenger](reports/2026-10-03/training_v4_behavioral_challenger_report.md) added causal merchant/location familiarity, but its best tree assigned an identical score to every validation transaction. These validation-only experiments do not support real-time use. No model should make automatic fraud decisions from them.

The [fraud-score diagnostic](reports/2026-10-03/fraud_score_validation_diagnostic_report.md) found 100% observed precision at thresholds 50 and 70 on validation, with 37.05% and 21.89% recall respectively. This may be the strongest existing signal, but it must not be used as a real-time feature or rule until its producer confirms it is independent of the label and available before authorization.

The [V5 improvement specification](spec/28-09-26-fraud-model/improvement_v5.md) is implemented through its capacity/encoding branch. A [training-only audit](reports/2026-10-03/train_signal_audit_report.md) confirmed internal-period support. The [V5 execution report](reports/2026-10-04/training_v5_catboost_report.md) records four CatBoost fits, natural-prevalence evaluation, frozen thresholds, and failure to attain supported 20%/50%/80% precision targets. Digital-event features remain unexecuted because SELECT is still blocked. Current negative results do not prove current labels are random, but do not justify a broad repeated parameter sweep on the same signals and inspected validation.

The [V6 advanced challenger](reports/2026-10-04/training_v6_advanced_report.md) completed XGBoost base/enhanced, balanced forest, Isolation Forest, a fixed rank blend, and a shuffled-label control. Enhanced XGBoost was selected, but later ROC-AUC was 0.5023 and frozen approximately 1% review precision **0.106% (8/7,536)**, below V5's 0.161%. No supported 20%/50%/80% precision target was feasible. Its seven new causal features did not produce useful later discrimination; no promotion or deployment occurred. See [V6 research and prerequisites](spec/28-09-26-fraud-model/improvement_v6.md).

## Exploratory notebook

[Fraud EDA notebook](notebooks/01_fraud_eda.ipynb) organizes Phases 0/1 into questions, Spark aggregate queries, charts, and interpretation cells. See [execution instructions](notebooks/README.md). It was executed successfully on serverless against Delta version 1. See [the dated EDA report](reports/2026-10-02/eda_report.md) and aggregate evidence JSON.

Phase 0/1 EDA notebook execution: [report](reports/2026-10-02/eda_report.md), [aggregate JSON evidence](reports/2026-10-02/eda_data.json). It ran on 2026-10-02 against Delta v1; no model training or source table writes occurred.

## Dispute integration contract

The [dispute integration contract](spec/28-09-26-fraud-model/dispute_integration.md) defines a customer-reported charge review workflow using authorized lookup and the existing human-handoff interfaces. Predictive fraud scoring stays unavailable for decision use. The contract documents current source gaps and acceptance cases; it is not a deployed integration.

## Integration with the original application

The ML branch now incorporates current `main` (PR #131). The standalone dispute demo was removed. The original agent exposes experimental model availability through `get_fraud_assessment`, and verified complaint handoffs carry that policy into the existing advisor UI. Predictive inference remains unavailable; real bank reads are blocked by permissions and local chat persistence is disabled. See [the local run guide](../LOCAL_MAIN_INTEGRATION.md) and [observed validation](reports/2026-10-04/main_integration_report.md).
