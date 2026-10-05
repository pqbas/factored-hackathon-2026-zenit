# ML roadmap

Specification source: [Fraud model](28-09-26-fraud-model/requirements.md).

| Phase | Outcome | Status |
|---|---|---|
| Design | 13-table map, features, and specs | Documented |
| 0 | Access, profiling, and compute feasibility | **Done 2026-09-28** — profile.py executed, 4,425,008 rows, 4,316 fraud (0.0975%), temporal split viable, fraud_score-label association confirmed |
| 1 | Causal V1 dataset and reproducible splits | **Done 2026-09-28** — features.py contract + temporal split; normalized USD amount validated (2.25% missing); no fitted preprocessing yet |
| EDA notebook | Spark-based data exploration on pinned Delta v1 | **Done 2026-10-02** — serverless run successful; see `../reports/2026-10-02/eda_report.md` |
| 2 | B0/B1 + logistic regression + decision tree with MLflow | **V1/V2 plus bounded Random Forest complete 2026-10-02; no promotion** — best V1 areaUnderPR 0.000994; V2 forest 0.000974 vs B0 0.000940. Final test excluded; see dated reports. |
| 3 | Final evaluation and utility decision | Pending |
| 4 | Behavioral features / model challengers | **V2–V4 complete; no ML promotion** — causal behavior features produced no useful ranking signal; V4's selected model was constant (ROC-AUC 0.50). A validation-only diagnostic found strong `fraud_score` alignment, but its timing/provenance is unknown. The digital-event audit is blocked until `SELECT` is granted on `workspace.bank_silver.digital_events`; see the [V3](../reports/2026-10-03/training_v3_feature_challenger_report.md), [V4](../reports/2026-10-03/training_v4_behavioral_challenger_report.md), and [score diagnostic](../reports/2026-10-03/fraud_score_validation_diagnostic_report.md). |
| 5 | Registration, scoring, and integration | Experimental native V7 artifact and original advisor integration implemented; no model promotion or automated decisions. See [execution report](../reports/2026-10-05/executable_predictions_report.md). |
| V5 | Capacity/encoding diagnostic, then independent digital signals | **CatBoost branch complete 2026-10-04; not promoted** — four candidates; later ROC-AUC 0.5038, frozen approximately 1% review precision 0.161%; no supported high-precision target. Digital SELECT still blocked. See [V5 report](../reports/2026-10-04/training_v5_catboost_report.md). |
| V6 | Causal feature ablation, imbalance ensembles, novelty, negative control | **Complete 2026-10-04; not promoted** — selected enhanced XGBoost later ROC-AUC 0.5023, frozen approximately 1% precision 0.106% (8/7,536), worse than V5 at that point. No supported high-precision target. Next distinct hypothesis requires digital access/timing and label provenance. See [V6 report](../reports/2026-10-04/training_v6_advanced_report.md). |

- [Requirements and models](28-09-26-fraud-model/requirements.md)
- [Plan and initial hyperparameters](28-09-26-fraud-model/plan.md)
- [Validation and delivery criteria](28-09-26-fraud-model/validation.md)
- [Data map](../data_map_and_features.md)
