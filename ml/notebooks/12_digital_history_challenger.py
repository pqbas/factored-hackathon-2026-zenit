# Databricks notebook source
# MAGIC %md
# MAGIC # V8: digital-history fraud challenger
# MAGIC Test newly readable prior digital activity against the deployed V7 native
# MAGIC model. Source reads only; 2026 final-test rows remain excluded. The digital
# MAGIC feed's processing dates are coarse and inconsistent, so availability uses
# MAGIC a conservative proxy rather than claiming real-time arrival correctness.

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


v4 = module("v8_training_v4", __V4_SOURCE__)
v5 = module("v8_training_v5", __V5_SOURCE__)
contract = module("v8_baseline_contract", __CONTRACT_SOURCE__)
trainer = module("v8_trainer", __TRAINER_SOURCE__)
baseline_binary = __BASELINE_BINARY__
baseline_manifest = __BASELINE_MANIFEST__
source_hashes = __SOURCE_HASHES__
code_commit = __CODE_COMMIT__
spark.conf.set("spark.sql.session.timeZone", "UTC")

# COMMAND ----------
# MAGIC %md
# MAGIC ## Independent boundary and delivery fixture
# MAGIC Verify Spark against a small Python oracle. Include lower boundaries,
# MAGIC simultaneous/future events, another customer, null customers, same-day
# MAGIC processing and deterministic latest-event ties. No source rows are printed.

# COMMAND ----------
T = datetime(2025, 1, 10, 12)
current = {"transaction_id": "fixture_tx", "customer_id": "fixture_c", "transaction_date": T, "transaction_country": "MX"}
events = []
for i, delta in enumerate([timedelta(hours=1), timedelta(days=1), timedelta(days=7), timedelta(0), timedelta(seconds=-1)]):
    t = T-delta
    events.append(dict(event_id=str(i), customer_id="fixture_c", event_date=t,
        process_date=(t-timedelta(days=1)).date(), event_type="Login", event_category="Authentication",
        platform="Android", browser=None, channel="Android App", ip_country="MX", is_mobile=True, duration_seconds=20))
events.append(dict(events[0], event_id="same_day", event_date=T-timedelta(minutes=1), process_date=T.date()))
events.append(dict(events[0], event_id="other", customer_id="other_c", event_date=T-timedelta(minutes=1)))
events.append(dict(events[0], event_id="null", customer_id=None, event_date=T-timedelta(minutes=1)))
events.append(dict(events[0], event_id="z_tie", ip_country="CO", event_type="Error"))
tx_fixture = spark.createDataFrame([current], "transaction_id string, customer_id string, transaction_date timestamp, transaction_country string")
event_schema = "event_id string, customer_id string, event_date timestamp, process_date date, event_type string, event_category string, platform string, browser string, channel string, ip_country string, is_mobile boolean, duration_seconds int"
ev_fixture = spark.createDataFrame(events, event_schema)
actual = trainer.build_digital_features(spark, tx_fixture, ev_fixture).first().asDict()
expected = trainer.digital_reference(current, events)
for key, value in expected.items():
    assert actual[key] == value or isinstance(value, (float, int)) and actual[key] is not None and math.isclose(actual[key], value), (key, actual[key], value)
assert actual["digital_count_7d"] == 4
assert actual["digital_latest_country_mismatch"] == 1
print("Independent Python/Spark timing fixture passed")

# COMMAND ----------
# MAGIC %md
# MAGIC ## Coverage, candidate selection and frozen-threshold comparison
# MAGIC Fit before January 2025; select on January–March; freeze a threshold on
# MAGIC April–June; evaluate only the selected challenger on July–December. All
# MAGIC development periods are exploratory. V7 is scored on identical later rows
# MAGIC with its original binary, medians and threshold. Memory checks bound every
# MAGIC collection, and later evaluation runs one month at a time.

# COMMAND ----------
result = trainer.run(spark, mlflow, v4, v5, contract, baseline_binary, baseline_manifest)
result["code_commit"] = code_commit
result["source_code_sha256"] = source_hashes
result["spark_python_fixture"] = "passed"
with mlflow.start_run(run_id=result["mlflow_run_id"]):
    mlflow.log_dict(result, "v8_aggregate_evidence.json")
print(json.dumps(result, indent=2, allow_nan=False))

# COMMAND ----------
# MAGIC %md
# MAGIC ## Decision
# MAGIC A relative gain over a weak baseline is insufficient. Apply the documented
# MAGIC usefulness gate and report real alert denominators. A successful challenger
# MAGIC still needs an independent final test and access to identical serving
# MAGIC features. Automatic fraud decisions remain disabled. This job creates only
# MAGIC notebook/run/MLflow artifacts and does not modify source tables or grants.

# COMMAND ----------
dbutils.notebook.exit(json.dumps(result, allow_nan=False))
