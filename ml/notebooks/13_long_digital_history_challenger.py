# Databricks notebook source
# MAGIC %md
# MAGIC # V9: longer digital history and Gold-consistent comparison
# MAGIC V8 had only about 6% seven-day coverage and did not improve precision.
# MAGIC Test a predeclared 90-day latest-event window and 30/90-day activity
# MAGIC counts. Use Gold transaction inputs, including its exchange-rate backfill,
# MAGIC so replaying the current V7 binary matches its original validation cohort.
# MAGIC Source reads only; final-test data remains sealed.

# COMMAND ----------
import json
import math
import types
from datetime import datetime, timedelta
import mlflow


def module(name, source):
    result = types.ModuleType(name)
    exec(compile(source, name, "exec"), result.__dict__)
    return result


v4 = module("v9_training_v4", __V4_SOURCE__)
v5 = module("v9_training_v5", __V5_SOURCE__)
contract = module("v9_baseline_contract", __CONTRACT_SOURCE__)
trainer = module("v9_shared_trainer", __TRAINER_SOURCE__)
v9 = module("v9_experiment", __V9_SOURCE__)
baseline_binary = __BASELINE_BINARY__
baseline_manifest = __BASELINE_MANIFEST__
source_hashes = __SOURCE_HASHES__
code_commit = __CODE_COMMIT__
spark.conf.set("spark.sql.session.timeZone", "UTC")

# COMMAND ----------
# MAGIC %md
# MAGIC ## Independent longer-window fixture
# MAGIC Include exact seven-, thirty- and ninety-day boundaries. Events beyond
# MAGIC ninety days, at the transaction time, in the future, from another customer,
# MAGIC or not conservatively available yet cannot influence the transaction.

# COMMAND ----------
T = datetime(2025, 4, 10, 12)
current = {"transaction_id":"fixture_tx", "customer_id":"fixture_c", "transaction_date":T, "transaction_country":"MX"}
events = []
for i, delta in enumerate([timedelta(hours=1), timedelta(days=7), timedelta(days=30), timedelta(days=90), timedelta(days=91), timedelta(0), timedelta(seconds=-1)]):
    t = T-delta
    events.append(dict(event_id=str(i), customer_id="fixture_c", event_date=t,
        process_date=(t-timedelta(days=1)).date(), event_type="Login", event_category="Authentication",
        platform="Android", browser=None, channel="Android App", ip_country="MX", is_mobile=True, duration_seconds=20))
events.append(dict(events[0], event_id="same_day", event_date=T-timedelta(minutes=1), process_date=T.date()))
events.append(dict(events[0], event_id="other", customer_id="other_c", event_date=T-timedelta(minutes=1)))
events.append(dict(events[0], event_id="z_tie", ip_country="CO", event_type="Error"))
tx_fixture = spark.createDataFrame([current], "transaction_id string, customer_id string, transaction_date timestamp, transaction_country string")
schema = "event_id string, customer_id string, event_date timestamp, process_date date, event_type string, event_category string, platform string, browser string, channel string, ip_country string, is_mobile boolean, duration_seconds int"
actual = trainer.build_digital_features(spark,tx_fixture,spark.createDataFrame(events,schema),lookback_days=90).first().asDict()
expected = trainer.digital_reference(current,events,lookback_days=90)
for key,value in expected.items():
    assert actual[key] == value or isinstance(value,(int,float)) and actual[key] is not None and math.isclose(actual[key],value), (key,actual[key],value)
assert actual["digital_count_7d"] == 3
assert actual["digital_count_30d"] == 4
assert actual["digital_count_90d"] == 5
assert actual["digital_error_count_90d"] == 1
print("Independent longer-window Python/Spark fixture passed")

# COMMAND ----------
# MAGIC %md
# MAGIC ## Two bounded candidates, then frozen-threshold evaluation
# MAGIC Compare natural and cost-sensitive class weighting on the expanded
# MAGIC history. Select using January–March; freeze thresholds on April–June;
# MAGIC evaluate July–December one month at a time. This is exploratory validation,
# MAGIC not a new independent holdout. Verify Gold replay against the V7 manifest.

# COMMAND ----------
result = v9.run(spark,mlflow,v4,v5,contract,baseline_binary,baseline_manifest,trainer)
result["code_commit"] = code_commit
result["source_code_sha256"] = source_hashes
result["spark_python_fixture"] = "passed"
with mlflow.start_run(run_id=result["mlflow_run_id"]):
    mlflow.log_dict(result,"v9_aggregate_evidence.json")
print(json.dumps(result,indent=2,allow_nan=False))

# COMMAND ----------
# MAGIC %md
# MAGIC ## Decision and limitations
# MAGIC Higher coverage is not evidence of better precision. Report full alert
# MAGIC denominators and monthly support, and preserve the source-timing and label
# MAGIC provenance limitations. No automatic fraud decision or production change
# MAGIC is enabled by this notebook.

# COMMAND ----------
dbutils.notebook.exit(json.dumps(result,allow_nan=False))
