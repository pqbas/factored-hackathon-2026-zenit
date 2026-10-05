"""V9: predeclared longer-history test and exact Gold-source V7 comparator."""
CANDIDATES = [
    {"name":"L0_long_digital_natural_weight","positive_weight":1,"recent_only":False},
    {"name":"L1_long_digital_cost_sensitive","positive_weight":20,"recent_only":False},
]


def run(spark, mlflow, v4, v5, contract, baseline_binary, baseline_manifest, trainer):
    return trainer.run(spark,mlflow,v4,v5,contract,baseline_binary,baseline_manifest,
        lookback_days=90,source_table="workspace.bank_gold.customer_transactions",
        experiment="/Shared/fraud-eda/phase9-long-digital-history",candidates=CANDIDATES)
