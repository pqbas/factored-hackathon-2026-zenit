# ML: fraud risk model

Trains and scores the fraud-risk model the dispute policy uses to decide escalations. Design: [`docs/ml_fraud_model_proposal.md`](../docs/ml_fraud_model_proposal.md).

Planned layout:

```
ml/
├── features.py        # point-in-time features from bank_silver.* (no post-transaction data)
├── train.py           # temporal split, baselines vs model, MLflow tracking, UC model registry
├── score.py           # batch scoring -> bank_gold.transaction_risk
└── databricks.yml     # serverless jobs for training and scoring
```

Status: not started. It waits for the real Factored dataset, because the dummy `is_fraud` is random.
