# Fraud model compute smoke test — 2026-10-02

## Result

A 1% deterministic sample from the training period successfully fit a regularized logistic-regression model and a depth-3 decision tree on Databricks Serverless environment version 4. The sample had 29,857 rows and 34 positive labels. Logistic fitting took 12.49 seconds and tree fitting took 4.76 seconds; the complete smoke function took 25.74 seconds, excluding serverless setup. This verifies API/runtime compatibility only. It is not a model-quality measurement and was not used to select a candidate.

[Databricks run record](https://dbc-184e79fe-04dc.cloud.databricks.com/?o=7474647867986650#job/179300007747661/run/346787125930929) · [Aggregate run evidence](training_smoke_data.json)

## Environment compatibility

The initial one-time run on the default Serverless environment failed because the PySpark ML `Imputer` constructor was not allowlisted. The retry explicitly selected environment version 4, which supports PySpark ML and MLflow for Spark according to [Databricks' environment version 4 documentation](https://docs.databricks.com/aws/en/release-notes/serverless/environment-version/four). The successful run validated pipeline fitting. Neither run modified source data or created tables.

## Scope and next action

- Source: `workspace.bank_silver.transactions`, Delta version 1.
- The smoke query sampled only transactions before 2025-07-01; validation and final-test rows were excluded.
- No model-quality metrics, threshold, winner, or promotion decision were produced.
- The full Phase 2 run compares B0/B1, two logistic-regression configurations, and two conservative decision-tree configurations on temporal validation. The smaller sweep is a compute-aware first pass; final test remains reserved for Phase 3.
- Serverless setup took about 195 seconds. Dollar cost was not available from the run output and is not estimated here.
