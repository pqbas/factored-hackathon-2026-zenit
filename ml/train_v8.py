"""V8: bounded digital-history challenger; no source writes or final-test reads.

Event processing dates are coarse and inconsistent. A conservative availability
proxy is the later of event time and the end of processing day. This is a
retrospective sensitivity experiment, not proof of online availability.
"""
from __future__ import annotations

import base64
import gc
import hashlib
import json
import math
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path

TX_TABLE = "workspace.bank_silver.transactions"
EVENT_TABLE = "workspace.bank_silver.digital_events"
TX_VERSION = 1
EVENT_VERSION = 4
END = "2026-01-01"
EXPERIMENT = "/Shared/fraud-eda/phase8-digital-history"
SEED = 42
DIGITAL_NUMERIC = [
    "digital_count_1h", "digital_count_24h", "digital_count_7d",
    "digital_login_count_24h", "digital_error_count_24h",
    "digital_seconds_since_latest", "digital_latest_country_mismatch",
    "digital_latest_is_mobile", "digital_latest_duration_log",
    "digital_latest_event_age_seconds", "digital_available",
]
DIGITAL_CATEGORICAL = [
    "digital_latest_type", "digital_latest_category", "digital_latest_platform",
    "digital_latest_browser", "digital_latest_channel",
]


def availability_time(event):
    """Require a valid process day; missing delivery metadata is not available."""
    process = event.get("process_date")
    if process is None or event.get("event_date") is None:
        return None
    if isinstance(process, str):
        process = datetime.fromisoformat(process).date()
    end_of_day = datetime.combine(process + timedelta(days=1), datetime.min.time())
    return max(event["event_date"], end_of_day)


def digital_reference(current, events):
    """Independent small oracle: no cross-customer, same-time or future events."""
    t = current["transaction_date"]
    eligible = []
    for event in events:
        available = availability_time(event)
        if current.get("customer_id") is not None and event.get("customer_id") == current["customer_id"] and available is not None and t-timedelta(days=7) <= available < t:
            eligible.append((available, event))
    result = {name: None for name in DIGITAL_NUMERIC + DIGITAL_CATEGORICAL}
    for suffix, delta in [("1h", timedelta(hours=1)), ("24h", timedelta(days=1)), ("7d", timedelta(days=7))]:
        result["digital_count_"+suffix] = sum(available >= t-delta for available, _ in eligible)
    for kind in ["Login", "Error"]:
        result["digital_"+kind.lower()+"_count_24h"] = sum(available >= t-timedelta(days=1) and event.get("event_type") == kind for available, event in eligible)
    result["digital_available"] = float(bool(eligible))
    if not eligible:
        return result
    available, event = max(eligible, key=lambda pair: (pair[0], pair[1]["event_date"], pair[1].get("event_id", "")))
    result["digital_seconds_since_latest"] = (t-available).total_seconds()
    result["digital_latest_event_age_seconds"] = (t-event["event_date"]).total_seconds()
    country, actual = current.get("transaction_country"), event.get("ip_country")
    result["digital_latest_country_mismatch"] = float(country != actual) if country and actual else None
    result["digital_latest_is_mobile"] = float(event["is_mobile"]) if event.get("is_mobile") is not None else None
    duration = event.get("duration_seconds")
    result["digital_latest_duration_log"] = math.log1p(max(0, duration)) if duration is not None else None
    for name, source in [("type", "event_type"), ("category", "event_category"), ("platform", "platform"), ("browser", "browser"), ("channel", "channel")]:
        result["digital_latest_"+name] = event.get(source)
    return result


def build_digital_features(spark, tx, events):
    """Combine narrow event/transaction streams; window end is T-1 microsecond."""
    from pyspark.sql import functions as F, Window

    tx = tx.where(F.col("transaction_date") < F.to_timestamp(F.lit(END)))
    events = events.where(F.col("event_date") < F.to_timestamp(F.lit(END))).where(
        F.col("customer_id").isNotNull() & F.col("event_date").isNotNull() & F.col("process_date").isNotNull()
    ).withColumn("_available", F.greatest("event_date", F.date_add("process_date", 1).cast("timestamp")))
    events = events.where(F.col("_available") < F.to_timestamp(F.lit(END)))
    latest_type = "struct<available_us:bigint,event_us:bigint,tie:string,country:string,mobile:boolean,duration:int,event_type:string,category:string,platform:string,browser:string,channel:string>"
    tx_stream = tx.select("transaction_id", "customer_id", F.expr("unix_micros(transaction_date)").alias("_time"), "transaction_country").withColumn(
        "_key", F.coalesce("customer_id", F.concat(F.lit("__missing_tx__"), F.col("transaction_id")))
    ).withColumn("_marker", F.lit(0)).withColumn("_login", F.lit(0)).withColumn("_error", F.lit(0)).withColumn(
        "_event", F.lit(None).cast(latest_type)
    ).withColumn("_is_tx", F.lit(1)).drop("customer_id")
    ev_stream = events.select(
        F.lit(None).cast("string").alias("transaction_id"), F.col("customer_id").alias("_key"),
        F.expr("unix_micros(_available)").alias("_time"), F.lit(None).cast("string").alias("transaction_country"),
        F.lit(1).alias("_marker"), (F.col("event_type") == "Login").cast("int").alias("_login"),
        (F.col("event_type") == "Error").cast("int").alias("_error"),
        F.struct(F.expr("unix_micros(_available)").alias("available_us"), F.expr("unix_micros(event_date)").alias("event_us"),
                 F.coalesce("event_id", F.lit("")).alias("tie"), F.col("ip_country").alias("country"),
                 F.col("is_mobile").alias("mobile"), F.col("duration_seconds").alias("duration"),
                 F.col("event_type"), F.col("event_category").alias("category"),
                 F.col("platform"), F.col("browser"), F.col("channel")).alias("_event"),
        F.lit(0).alias("_is_tx"),
    )
    stream = tx_stream.unionByName(ev_stream)
    ordered = Window.partitionBy("_key").orderBy("_time")
    for suffix, micros in [("1h", 3_600_000_000), ("24h", 86_400_000_000), ("7d", 604_800_000_000)]:
        stream = stream.withColumn("digital_count_"+suffix, F.sum("_marker").over(ordered.rangeBetween(-micros, -1)).cast("double"))
    for kind in ["login", "error"]:
        stream = stream.withColumn("digital_"+kind+"_count_24h", F.sum("_"+kind).over(ordered.rangeBetween(-86_400_000_000, -1)).cast("double"))
    stream = stream.withColumn("_latest", F.max("_event").over(ordered.rangeBetween(-604_800_000_000, -1))).where(F.col("_is_tx") == 1)
    result = stream.withColumn("digital_available", F.col("_latest").isNotNull().cast("double")).withColumn(
        "digital_seconds_since_latest", (F.col("_time")-F.col("_latest.available_us"))/1_000_000
    ).withColumn("digital_latest_event_age_seconds", (F.col("_time")-F.col("_latest.event_us"))/1_000_000).withColumn(
        "digital_latest_country_mismatch", F.when(F.col("transaction_country").isNotNull() & F.col("_latest.country").isNotNull(), (F.col("transaction_country") != F.col("_latest.country")).cast("double"))
    ).withColumn("digital_latest_is_mobile", F.col("_latest.mobile").cast("double")).withColumn(
        "digital_latest_duration_log", F.when(F.col("_latest.duration").isNotNull(), F.log1p(F.greatest(F.col("_latest.duration"), F.lit(0))))
    )
    for name, source in [("type", "event_type"), ("category", "category"), ("platform", "platform"), ("browser", "browser"), ("channel", "channel")]:
        result = result.withColumn("digital_latest_"+name, F.col("_latest."+source))
    return result.fillna(0, subset=["digital_count_1h", "digital_count_24h", "digital_count_7d", "digital_login_count_24h", "digital_error_count_24h"]).select("transaction_id", *DIGITAL_NUMERIC, *DIGITAL_CATEGORICAL)


def candidate_definitions():
    return [
        {"name": "D0_digital_natural_weight", "positive_weight": 1, "recent_only": False},
        {"name": "D1_digital_cost_sensitive", "positive_weight": 20, "recent_only": False},
        {"name": "D2_digital_recent_natural", "positive_weight": 1, "recent_only": True},
    ]


def clears_exploratory_gate(metrics, baseline):
    """A worthwhile ranking gain still does not constitute production validation."""
    return (metrics["average_precision"] >= max(3*metrics["prevalence"], 1.5*baseline["average_precision"])
            and metrics.get("precision") is not None
            and metrics["precision"] >= max(0.01, 2*(baseline.get("precision") or 0))
            and metrics["recall"] >= 0.10 and metrics["alerts"] >= 100
            and metrics["roc_auc"] >= 0.60)


def run(spark, mlflow, v4, v5, contract, baseline_binary, baseline_manifest):
    import numpy as np
    import pandas as pd
    import catboost
    from catboost import CatBoostClassifier, Pool
    from pyspark.sql import functions as F

    started = time.monotonic()
    spark.conf.set("spark.sql.session.timeZone", "UTC")
    tx = spark.read.option("versionAsOf", TX_VERSION).table(TX_TABLE).where(F.col("transaction_date") < F.to_timestamp(F.lit(END)))
    ev = spark.read.option("versionAsOf", EVENT_VERSION).table(EVENT_TABLE).where(F.col("event_date") < F.to_timestamp(F.lit(END)))
    digital = build_digital_features(spark, tx, ev)
    frame = v4.build_feature_frame(spark, source_frame=tx).join(digital, "transaction_id", "left").withColumn(
        "period", F.when(F.col("transaction_date") < "2025-01-01", "fit").when(F.col("transaction_date") < "2025-04-01", "selection")
        .when(F.col("transaction_date") < "2025-07-01", "operating_point").otherwise("validation")
    )
    numeric = list(contract.NUMERIC) + DIGITAL_NUMERIC
    categorical = list(contract.CATEGORICAL) + DIGITAL_CATEGORICAL
    predictors = numeric + categorical
    counts = {r["period"]:{"rows":int(r["rows"]),"fraud":int(r["fraud"])} for r in frame.groupBy("period").agg(F.count("label").alias("rows"),F.sum("label").alias("fraud")).collect()}
    assert counts == {"fit":{"rows":2271707,"fraud":2296},"selection":{"rows":356361,"fraud":344},"operating_point":{"rows":366529,"fraud":374},"validation":{"rows":743909,"fraud":699}}, counts
    coverage = [r.asDict() for r in frame.groupBy("period", "digital_available").agg(F.count("label").alias("rows"),F.sum("label").alias("fraud"),F.avg("digital_count_7d").alias("mean_events_7d")).collect()]
    result = {"status":"SUCCESS","source_tables":{TX_TABLE:TX_VERSION,EVENT_TABLE:EVENT_VERSION},"feature_version":"v8_conservative_digital_history",
        "availability_proxy":"max(event_date, start_of_day(process_date + 1 day)); strict availability < T; seven-day availability window",
        "online_availability_verified":False,"final_test_used":False,"source_tables_modified":False,"row_level_records_exported":False,
        "split_counts":counts,"coverage":coverage,"predictor_allowlist":predictors,"candidate_definitions":candidate_definitions(),
        "libraries":{"catboost":catboost.__version__,"numpy":np.__version__,"pandas":pd.__version__},"memory_checks":[],"attempts":[],
        "evaluation_status":"exploratory; development periods previously inspected; final 2026 test remains sealed",
        "baseline_run_id":baseline_manifest["run_id"],"automatic_decisions_enabled":False}

    def load(df, name):
        n = df.count()
        df = df.select("label",F.date_format("transaction_date","yyyy-MM").alias("month"),*predictors)
        pilot = df.limit(256).toPandas()
        projected = int(pilot.memory_usage(deep=True).sum()/max(len(pilot),1)*n*3)
        limit = min(int(v5.available_memory_bytes()*0.45),2*1024**3)
        result["memory_checks"].append({"period":name,"rows":n,"estimated_peak_bytes":projected,"limit_bytes":limit})
        if projected > limit:
            raise MemoryError(f"Bounded driver collection rejected: {name}, {projected} > {limit}")
        data = df.toPandas()
        assert len(data) == n
        return data

    def matrix(data, medians):
        out = pd.DataFrame(index=data.index)
        for name in numeric:
            values = pd.to_numeric(data[name],errors="coerce").replace([np.inf,-np.inf],np.nan)
            out[name+"_missing"] = values.isna().astype(float)
            out[name] = values.fillna(medians[name]).astype(float)
        for name in categorical:
            out[name] = data[name].fillna("__missing__").astype(str).str.strip().replace("","__missing__")
        out["has_prior_amount_support"] = (out["customer_same_currency_tx_count_30d"] >= 5).astype(float)
        return out

    fit = load(frame.where(F.col("period") == "fit").where((F.col("label") == 1) | (F.pmod(F.xxhash64("transaction_id",F.lit(SEED)),F.lit(1_000_000)) < 100_000)).orderBy("transaction_date","transaction_id"),"sampled_fit")
    assert int(fit["label"].sum()) == counts["fit"]["fraud"]
    selection = load(frame.where(F.col("period") == "selection"),"selection")
    sy = selection["label"].to_numpy(dtype=int)
    models = {}
    for definition in candidate_definitions():
        if time.monotonic()-started > 3000:
            raise TimeoutError("Bounded experiment runtime exceeded")
        data = fit[fit["month"] >= "2024-07"] if definition["recent_only"] else fit
        medians = {}
        for name in numeric:
            value = pd.to_numeric(data[name],errors="coerce").replace([np.inf,-np.inf],np.nan).median()
            medians[name] = float(value) if pd.notna(value) else 0.0
        xf, xs = matrix(data,medians), matrix(selection,medians)
        y = data["label"].to_numpy(dtype=int)
        params = dict(iterations=350,depth=6,learning_rate=0.05,l2_leaf_reg=15,class_weights=[1,definition["positive_weight"]],loss_function="Logloss",eval_metric="PRAUC",random_seed=SEED,thread_count=4,has_time=True,allow_writing_files=False,verbose=False)
        model = CatBoostClassifier(**params)
        before = time.monotonic()
        model.fit(Pool(xf,y,cat_features=categorical,weight=np.where(y==1,1.0,10.0)),eval_set=Pool(xs,sy,cat_features=categorical),early_stopping_rounds=40,use_best_model=True)
        scores = model.predict_proba(Pool(xs,cat_features=categorical),thread_count=4)[:,1]
        record = {**definition,"parameters":params,"fit_rows":len(y),"fit_fraud":int(y.sum()),"trees":model.tree_count_,"fit_seconds":time.monotonic()-before,"selection_metrics":v5.prediction_metrics(sy,scores)}
        result["attempts"].append(record)
        print("V8 candidate:",json.dumps(record),flush=True)
        models[definition["name"]] = (model,medians)
        del xf,xs,scores
        gc.collect()
    selected = max(result["attempts"],key=lambda item:item["selection_metrics"]["average_precision"])
    result["selected_candidate"] = selected["name"]
    model,medians = models[selected["name"]]
    del models,fit,selection
    gc.collect()
    with tempfile.TemporaryDirectory() as folder:
        baseline_path = Path(folder)/"v7.cbm"
        baseline_path.write_bytes(base64.b64decode(baseline_binary))
        assert hashlib.sha256(baseline_path.read_bytes()).hexdigest() == baseline_manifest["model_sha256"]
        baseline = CatBoostClassifier()
        baseline.load_model(str(baseline_path))

        def predict(data):
            actual = model.predict_proba(Pool(matrix(data,medians),cat_features=categorical),thread_count=4)[:,1]
            # Reuse the deployed contract and its fitted medians exactly.
            bx = matrix(data,{**medians,**baseline_manifest["medians"]})[contract.FEATURES]
            for index in range(min(8,len(data))):
                expected = contract.vector(data.iloc[index].to_dict(),baseline_manifest["medians"])
                assert all(a == b or isinstance(a,(int,float)) and isinstance(b,(int,float)) and math.isclose(a,b,rel_tol=1e-10,abs_tol=1e-10) for a,b in zip(bx.iloc[index].tolist(),expected))
            old = baseline.predict_proba(Pool(bx,cat_features=contract.CATEGORICAL),thread_count=4)[:,1]
            return actual,old

        op = load(frame.where(F.col("period") == "operating_point"),"operating_point")
        op_y = op["label"].to_numpy(dtype=int)
        scores,old = predict(op)
        points = v5.operating_points(op_y,scores)
        result["operating_points"] = points
        point = next(item["point"] for item in points["budgets"] if item["budget"] == 0.01)
        if point is None:
            raise ValueError("No supported threshold at 1% review budget")
        threshold = point["threshold"]
        result["threshold"] = threshold
        result["operating_metrics"] = v5.prediction_metrics(op_y,scores,threshold)
        result["baseline_operating_metrics"] = v5.prediction_metrics(op_y,old,baseline_manifest["threshold"])
        del op,scores,old,op_y
        gc.collect()
        labels,scores_list,old_list = [],[],[]
        monthly = []
        for month in range(7,13):
            data = load(frame.where((F.col("period") == "validation") & (F.month("transaction_date") == month)),f"validation_2025_{month:02d}")
            y = data["label"].to_numpy(dtype=int)
            scores,old = predict(data)
            labels.append(y); scores_list.append(scores); old_list.append(old)
            monthly.append({"month":f"2025-{month:02d}","candidate":v5.prediction_metrics(y,scores,threshold),"baseline":v5.prediction_metrics(y,old,baseline_manifest["threshold"])})
            print("V8 monthly:",json.dumps(monthly[-1]),flush=True)
            del data,scores,old
            gc.collect()
        y,scores,old = np.concatenate(labels),np.concatenate(scores_list),np.concatenate(old_list)
        result["validation_metrics"] = v5.prediction_metrics(y,scores,threshold)
        result["baseline_validation_metrics"] = v5.prediction_metrics(y,old,baseline_manifest["threshold"])
        result["monthly"] = monthly
        result["clears_exploratory_gate"] = clears_exploratory_gate(result["validation_metrics"],result["baseline_validation_metrics"])
        result["promotion_status"] = "REQUIRES_INDEPENDENT_TEST_AND_SERVING_FEATURES" if result["clears_exploratory_gate"] else "REJECTED_NO_USEFUL_VALIDATED_GAIN"
        importance = model.get_feature_importance()
        result["feature_importance"] = sorted([{ "feature":name,"importance":float(value)} for name,value in zip(model.feature_names_,importance)],key=lambda item:item["importance"],reverse=True)[:25]
        result["runtime_seconds"] = time.monotonic()-started
        mlflow.set_experiment(EXPERIMENT)
        with mlflow.start_run(run_name="V8_digital_history_challenger") as run:
            result["mlflow_run_id"] = run.info.run_id
            mlflow.set_tags({"phase":"V8","final_test_used":"false","promotion_status":result["promotion_status"]})
            target = Path(folder)/"v8.cbm"
            model.save_model(str(target))
            result["model_sha256"] = hashlib.sha256(target.read_bytes()).hexdigest()
            result["model_bytes"] = target.stat().st_size
            mlflow.log_artifact(str(target),"candidate_model")
            mlflow.log_dict({"medians":medians,"numeric":numeric,"categorical":categorical,"feature_names":model.feature_names_,"threshold":threshold,"final_test_used":False},"candidate_model/feature_contract.json")
            mlflow.log_metrics({"validation_ap":result["validation_metrics"]["average_precision"],"validation_precision":result["validation_metrics"]["precision"] or 0,"validation_recall":result["validation_metrics"]["recall"],"baseline_ap":result["baseline_validation_metrics"]["average_precision"]})
            mlflow.log_dict(result,"v8_aggregate_evidence.json")
    return result
