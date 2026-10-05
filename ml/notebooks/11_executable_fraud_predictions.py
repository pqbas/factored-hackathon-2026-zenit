# Databricks notebook source
# MAGIC %md
# MAGIC # Executable fraud predictions for the existing assistant
# MAGIC Train a CatBoost artifact using features available in the existing Gold and
# MAGIC Lakebase tables. Source reads only; 2026 final-test labels remain sealed.
# MAGIC Raw outputs are experimental scores, not validated customer probabilities.

# COMMAND ----------
import hashlib
import json
import types
import mlflow

def module(name, source):
    result = types.ModuleType(name)
    exec(compile(source, name, "exec"), result.__dict__)
    return result

v4 = module("training_v4", __V4_SOURCE__)
v5 = module("training_v5", __V5_SOURCE__)
contract = module("serving_contract", __CONTRACT_SOURCE__)
trainer = module("serving_trainer", __TRAINER_SOURCE__)
source_hashes = __SOURCE_HASHES__
code_commit = __CODE_COMMIT__

# COMMAND ----------
# MAGIC %md
# MAGIC ## Fit, freeze a threshold and export
# MAGIC Fit before January 2025, freeze the review threshold on April–June 2025,
# MAGIC and evaluate descriptively on July–December 2025. Hyperparameters follow
# MAGIC V5 C3; coordinates are excluded because serving has none. Predictor order,
# MAGIC fitted medians, native binary hash and feature version are exported together.
# MAGIC No high-precision operating point or production promotion is asserted.

# COMMAND ----------
result = trainer.run(spark, mlflow, v4, v5, contract)
result["manifest"]["code_commit"] = code_commit
result["manifest"]["source_code_sha256"] = source_hashes
print(json.dumps(result["manifest"], indent=2))

# COMMAND ----------
# MAGIC %md
# MAGIC ## Artifact handoff
# MAGIC The notebook returns only the executable model and aggregate metadata.
# MAGIC No transaction rows, identifiers or customer records leave the driver.
# MAGIC The assistant loads the native artifact; trusted customer-scoped reads
# MAGIC supply the current transaction and strictly earlier history at inference.

# COMMAND ----------
dbutils.notebook.exit(json.dumps(result))
