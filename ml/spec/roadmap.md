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
| 4 | Behavioral features / model challengers | **V2 and V3 transaction-context challenger complete; no promotion** — customer history, transaction category, and coarse location did not produce useful lift. The digital-event coverage audit is blocked until `SELECT` is granted on `workspace.bank_silver.digital_events`; see `../reports/2026-10-03/training_v3_feature_challenger_report.md`. |
| 5 | Registration, scoring, and integration | Pending; depends on evidence |

- [Requirements and models](28-09-26-fraud-model/requirements.md)
- [Plan and initial hyperparameters](28-09-26-fraud-model/plan.md)
- [Validation and delivery criteria](28-09-26-fraud-model/validation.md)
- [Data map](../data_map_and_features.md)
