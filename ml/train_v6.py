"""Research-backed V6: causal feature ablation, balanced ensemble and novelty.

Source tables are read only. Protocol helpers and the existing V4 builder are
passed explicitly by the shared notebook, avoiding notebook/module path magic.
"""
from __future__ import annotations

import gc
import math
import time
from datetime import datetime, timedelta
from statistics import mean, stdev

V6_EXTRA_NUMERIC = [
    "product_tx_count_5m", "product_tx_count_1h", "product_same_currency_abs_amount_sum_1h",
    "customer_same_currency_std_amount_30d", "customer_amount_zscore_30d",
    "customer_country_tx_count_30d", "customer_new_country_30d",
]
V6_EXPERIMENT = "/Shared/fraud-eda/phase6-advanced-challenger"


def causal_extra_features(current, history):
    """Small reference oracle for Spark boundary/mixed-currency fixtures."""
    t = current["transaction_date"]
    prior = [r for r in history if r["transaction_date"] < t]
    product = [r for r in prior if current.get("product_id") is not None and r.get("product_id") == current["product_id"]]
    customer = [r for r in prior if current.get("customer_id") is not None and r.get("customer_id") == current["customer_id"] and r["transaction_date"] >= t - timedelta(days=30)]
    amounts = [abs(float(r["amount"])) for r in customer if r.get("currency") == current.get("currency") and r.get("amount") is not None]
    sigma = stdev(amounts) if len(amounts) > 1 else None
    country = current.get("transaction_country")
    country_count = sum(r.get("transaction_country") == country for r in customer)
    recent = [r for r in product if r["transaction_date"] >= t - timedelta(hours=1)]
    recent_amounts = [abs(float(r["amount"])) for r in recent if r.get("currency") == current.get("currency") and r.get("amount") is not None]
    return {
        "product_tx_count_5m": sum(r["transaction_date"] >= t - timedelta(minutes=5) for r in product),
        "product_tx_count_1h": len(recent),
        "product_same_currency_abs_amount_sum_1h": sum(recent_amounts) if recent_amounts else None,
        "customer_same_currency_std_amount_30d": sigma,
        "customer_amount_zscore_30d": (abs(float(current["amount"])) - mean(amounts)) / sigma if len(amounts) >= 5 and sigma and sigma > 0 else None,
        "customer_country_tx_count_30d": country_count if country else None,
        "customer_new_country_30d": int(country_count == 0) if country else None,
    }


def build_v6_features(spark, base_builder, end_exclusive="2026-01-01", source_frame=None):
    from pyspark.sql import functions as F, Window
    from datetime import date
    date.fromisoformat(end_exclusive)
    if end_exclusive > "2026-01-01":
        raise ValueError("Final test is sealed")
    base = base_builder(spark, end_exclusive=end_exclusive, source_frame=source_frame)
    source = source_frame if source_frame is not None else spark.read.option("versionAsOf", 1).table("workspace.bank_silver.transactions")
    raw = source.where(F.col("transaction_date") < F.to_timestamp(F.lit(end_exclusive))).select(
        "transaction_id", "product_id", "customer_id", "transaction_date", "amount", "currency", "transaction_country"
    ).withColumn("_t", F.expr("unix_micros(transaction_date)"))
    for name in ["product_id", "customer_id"]:
        raw = raw.withColumn("_hist_" + name, F.coalesce(F.col(name), F.concat(F.lit("__missing__"), F.col("transaction_id"))))
    product_order = Window.partitionBy("_hist_product_id").orderBy("_t")
    currency_product = Window.partitionBy("_hist_product_id", "currency").orderBy("_t").rangeBetween(-3_600_000_000, -1)
    customer_currency = Window.partitionBy("_hist_customer_id", "currency").orderBy("_t").rangeBetween(-2_592_000_000_000, -1)
    customer_country = Window.partitionBy("_hist_customer_id", "transaction_country").orderBy("_t").rangeBetween(-2_592_000_000_000, -1)
    amount = F.abs(F.col("amount").cast("double"))
    extra = raw.withColumn("product_tx_count_5m", F.count("transaction_id").over(product_order.rangeBetween(-300_000_000, -1))).withColumn(
        "product_tx_count_1h", F.count("transaction_id").over(product_order.rangeBetween(-3_600_000_000, -1))
    ).withColumn("product_same_currency_abs_amount_sum_1h", F.sum(amount).over(currency_product)).withColumn(
        "customer_same_currency_std_amount_30d", F.stddev_samp(amount).over(customer_currency)
    ).withColumn("customer_amount_zscore_30d", F.when(
        (F.count("amount").over(customer_currency) >= 5) & (F.col("customer_same_currency_std_amount_30d") > 0),
        (amount - F.avg(amount).over(customer_currency)) / F.col("customer_same_currency_std_amount_30d")
    )).withColumn("customer_country_tx_count_30d", F.when(F.col("transaction_country").isNotNull(), F.count("transaction_id").over(customer_country))).withColumn(
        "customer_new_country_30d", F.when(F.col("transaction_country").isNotNull(), F.when(F.col("customer_country_tx_count_30d") == 0, 1.0).otherwise(0.0))
    )
    return base.join(extra.select("transaction_id", *V6_EXTRA_NUMERIC), "transaction_id", "left")


def empirical_rank(reference, scores):
    """Normalize different score scales with a fit-only reference distribution.

    Complete ties have equal ranks. Ranks are not fraud probabilities.
    """
    import numpy as np
    ref, s = np.asarray(reference, dtype=float), np.asarray(scores, dtype=float)
    if not len(ref) or not np.isfinite(ref).all() or not np.isfinite(s).all():
        raise ValueError("Finite nonempty reference required")
    return np.searchsorted(np.sort(ref), s, side="right") / len(ref)


def permute_labels_and_weights(labels, weights, seed=42):
    """Permutation control keeps label/weight pairs intact, breaks feature link."""
    import numpy as np
    y, w = np.asarray(labels), np.asarray(weights)
    if len(y) != len(w):
        raise ValueError("Aligned labels/weights required")
    indices = np.random.default_rng(seed).permutation(len(y))
    return y[indices], w[indices]


def encode_features(frame, numeric, categorical, medians, encoder):
    import numpy as np
    values = frame[numeric].to_numpy(dtype=np.float32)
    missing = ~np.isfinite(values)
    fill = np.array([medians[c] for c in numeric], dtype=np.float32)
    values = np.where(missing, fill[None, :], values)
    cats = frame[categorical].fillna("__missing__").astype(str)
    return np.concatenate([values, missing.astype(np.float32), encoder.transform(cats)], axis=1)


def run_v6(spark, mlflow, base_builder, base_numeric, categorical, metric_fn, point_fn, memory_fn):
    import numpy as np
    import pandas as pd
    import sklearn
    import imblearn
    import xgboost
    from xgboost import XGBClassifier
    from imblearn.ensemble import BalancedRandomForestClassifier
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import OneHotEncoder
    from pyspark.sql import functions as F

    started = time.monotonic()
    numeric = list(base_numeric) + V6_EXTRA_NUMERIC
    predictors = numeric + list(categorical)
    frame = build_v6_features(spark, base_builder).withColumn("period",
        F.when(F.col("transaction_date") < F.to_timestamp(F.lit("2025-01-01")), "fit")
        .when(F.col("transaction_date") < F.to_timestamp(F.lit("2025-04-01")), "selection")
        .when(F.col("transaction_date") < F.to_timestamp(F.lit("2025-07-01")), "operating_point")
        .otherwise("exploratory_validation"))
    counts = {r["period"]: {"rows": int(r["rows"]), "fraud": int(r["fraud"])} for r in frame.groupBy("period").agg(
        F.count("label").alias("rows"), F.sum("label").alias("fraud")).collect()}
    for name in ["fit", "selection", "operating_point", "exploratory_validation"]:
        c = counts[name]
        if not 0 < c["fraud"] < c["rows"]:
            raise ValueError("Both classes required in every period")
    fit_frame = frame.where(F.col("period") == "fit").where(
        (F.col("label") == 1) | (F.pmod(F.xxhash64("transaction_id", F.lit(42)), F.lit(1_000_000)) < 100_000)
    ).orderBy("transaction_date", "transaction_id")
    fit_count = fit_frame.count()
    result = {"feature_version": "v6_causal_product_country_amount", "delta_version": 1,
              "source_table": "workspace.bank_silver.transactions", "split_counts": counts,
              "sampling": {"fit_rows_used": fit_count, "negative_fraction": 0.10,
                           "all_fit_positives_retained": True, "evaluation_sampled": False},
              "final_test_used": False, "source_tables_modified": False,
              "row_level_records_exported": False, "metric_primary": "sklearn average_precision_score",
              "libraries": {"xgboost": xgboost.__version__, "imblearn": imblearn.__version__, "sklearn": sklearn.__version__},
              "feature_allowlist": predictors, "extra_features": V6_EXTRA_NUMERIC,
              "memory_checks": [], "attempts": [], "seed": 42}

    def load(df, n, name):
        df = df.select("label", F.date_format("transaction_date", "yyyy-MM").alias("month"), *predictors)
        pilot = df.limit(256).toPandas()
        estimate = int(pilot.memory_usage(deep=True).sum() / len(pilot) * n * 3)
        budget = min(int(memory_fn() * 0.45), 2 * 1024**3)
        result["memory_checks"].append({"period": name, "rows": n, "estimated_peak_bytes": estimate, "limit_bytes": budget})
        if estimate > budget:
            raise MemoryError(f"Driver collection exceeds memory guard: {name}")
        data = df.toPandas()
        if len(data) != n:
            raise ValueError("Feature join changed row cardinality")
        return data

    fit = load(fit_frame, fit_count, "sampled_fit")
    selection = load(frame.where(F.col("period") == "selection"), counts["selection"]["rows"], "selection")
    y = fit["label"].to_numpy(dtype=int); sy = selection["label"].to_numpy(dtype=int)
    if int(y.sum()) != counts["fit"]["fraud"]:
        raise ValueError("Sampling lost fit positives")
    medians = {c: float(pd.to_numeric(fit[c], errors="coerce").replace([np.inf, -np.inf], np.nan).median()) for c in numeric}
    medians = {c: v if np.isfinite(v) else 0.0 for c, v in medians.items()}
    encoder = OneHotEncoder(handle_unknown="ignore", sparse_output=False, dtype=np.float32).fit(fit[categorical].fillna("__missing__").astype(str))
    xf = encode_features(fit, numeric, categorical, medians, encoder)
    xs = encode_features(selection, numeric, categorical, medians, encoder)
    base_indices = list(range(len(base_numeric))) + list(range(len(numeric), len(numeric) + len(base_numeric))) + list(range(2 * len(numeric), xf.shape[1]))
    weights = np.where(y == 1, 1.0, 10.0)
    negatives = np.flatnonzero(y == 0)
    reference_indices = np.random.default_rng(43).choice(negatives, min(20000, len(negatives)), replace=False)
    models = {}; references = {}; selection_scores = {}; best = None
    mlflow.set_experiment(V6_EXPERIMENT)
    with mlflow.start_run(run_name="V6_research_backed_challengers") as parent:
        result["mlflow_parent_run_id"] = parent.info.run_id
        mlflow.set_tags({"test_accessed": "false", "promotion": "none", "phase": "V6"})
        def xgb():
            return XGBClassifier(n_estimators=400, max_depth=5, learning_rate=0.05,
                min_child_weight=10, reg_lambda=20, subsample=0.8, colsample_bytree=0.8,
                scale_pos_weight=20, objective="binary:logistic", eval_metric="aucpr",
                tree_method="hist", n_jobs=4, random_state=42, early_stopping_rounds=40)
        for name in ["A0_xgb_base", "A1_xgb_enhanced", "A2_balanced_forest", "A3_isolation_forest"]:
            if time.monotonic() - started > 3000:
                raise TimeoutError("Runtime cap reached")
            begin = time.monotonic()
            with mlflow.start_run(run_name=name, nested=True) as child:
                if name.startswith("A0"):
                    model = xgb().fit(xf[:, base_indices], y, sample_weight=weights, eval_set=[(xs[:, base_indices], sy)], verbose=False)
                    score = model.predict_proba(xs[:, base_indices])[:, 1]
                elif name.startswith("A1"):
                    model = xgb().fit(xf, y, sample_weight=weights, eval_set=[(xs, sy)], verbose=False)
                    score = model.predict_proba(xs)[:, 1]
                elif name.startswith("A2"):
                    model = BalancedRandomForestClassifier(n_estimators=160, max_depth=10,
                        min_samples_leaf=5, sampling_strategy=0.2, replacement=True,
                        bootstrap=False, n_jobs=4, random_state=42).fit(xf, y)
                    score = model.predict_proba(xs)[:, 1]
                else:
                    neg = np.flatnonzero(y == 0)
                    chosen = np.random.default_rng(42).choice(neg, min(20000, len(neg)), replace=False)
                    model = IsolationForest(n_estimators=100, max_samples=256, n_jobs=4, random_state=42).fit(xf[chosen])
                    score = -model.score_samples(xs)
                metrics = metric_fn(sy, score)
                record = {"candidate": name, "selection": metrics, "runtime_seconds": time.monotonic() - begin, "run_id": child.info.run_id}
                if hasattr(model, "best_iteration"):
                    record["effective_iterations"] = int(model.best_iteration) + 1
                result["attempts"].append(record)
                mlflow.log_metrics({"selection_ap": metrics["average_precision"], "selection_roc_auc": metrics["roc_auc"]})
                models[name] = model; selection_scores[name] = score
                if name != "A0_xgb_base":
                    reference_sample = xf[reference_indices]
                    references[name] = -model.score_samples(reference_sample) if name == "A3_isolation_forest" else model.predict_proba(reference_sample)[:, 1]
                if best is None or metrics["average_precision"] > best["selection"]["average_precision"]:
                    best = record
                print("V6 candidate:", record, flush=True)
        blend = np.mean([empirical_rank(references[n], selection_scores[n]) for n in references], axis=0)
        record = {"candidate": "A4_fixed_rank_blend", "selection": metric_fn(sy, blend), "members": list(references), "weights": "fixed equal weights; fit-only rank normalization"}
        result["attempts"].append(record)
        if record["selection"]["average_precision"] > best["selection"]["average_precision"]:
            best = record

        # A genuine null diagnostic, never eligible for candidate selection.
        perm_y, perm_w = permute_labels_and_weights(y, weights)
        control = xgb().fit(xf, perm_y, sample_weight=perm_w, eval_set=[(xs, sy)], verbose=False)
        result["negative_control"] = {"description": "XGBoost enhanced with shuffled fit label/weight pairs; selection labels remain genuine", "selection": metric_fn(sy, control.predict_proba(xs)[:, 1])}
        result["selected_candidate"] = best
        result["preprocessing"] = "Sampled-fit medians, explicit numeric missing flags, fit-only categorical one-hot encoding; identical evaluation cohorts and preprocessing for feature ablation."
        result["model_parameters"] = {name: model.get_params() for name, model in models.items()}
        # Estimator params are primitive except possible version-specific wrappers.
        result["model_parameters"] = {n: {k: (str(v) if isinstance(v, float) and not math.isfinite(v) else v) for k, v in p.items() if isinstance(v, (str, int, float, bool, type(None)))} for n, p in result["model_parameters"].items()}
        del fit, selection, xf, xs, control, selection_scores, blend, y, sy, weights
        gc.collect()
        chosen_name = best["candidate"]
        def predict(x):
            if chosen_name == "A0_xgb_base":
                return models[chosen_name].predict_proba(x[:, base_indices])[:, 1]
            if chosen_name == "A3_isolation_forest":
                return -models[chosen_name].score_samples(x)
            if chosen_name == "A4_fixed_rank_blend":
                return np.mean([empirical_rank(references[n], -models[n].score_samples(x) if n == "A3_isolation_forest" else models[n].predict_proba(x)[:, 1]) for n in references], axis=0)
            return models[chosen_name].predict_proba(x)[:, 1]
        op = load(frame.where(F.col("period") == "operating_point"), counts["operating_point"]["rows"], "operating_point")
        ox = encode_features(op, numeric, categorical, medians, encoder)
        oy = op["label"].to_numpy(dtype=int); oscores = predict(ox)
        points = point_fn(oy, oscores)
        result["operating_period"] = {"metrics": metric_fn(oy, oscores), "points": points}
        del op, ox, oy, oscores
        gc.collect()
        val = load(frame.where(F.col("period") == "exploratory_validation"), counts["exploratory_validation"]["rows"], "exploratory_validation")
        vx = encode_features(val, numeric, categorical, medians, encoder)
        vy = val["label"].to_numpy(dtype=int); vscores = predict(vx)
        result["exploratory_validation"] = metric_fn(vy, vscores)
        result["exploratory_validation"]["frozen_budget_results"] = [{"budget": p["budget"], "metrics": metric_fn(vy, vscores, p["point"]["threshold"]) if p["point"] else None} for p in points["budgets"]]
        result["exploratory_validation"]["frozen_precision_target_results"] = [{"target_precision": p["target_precision"], "feasible_on_operating_period": p["feasible"], "metrics": metric_fn(vy, vscores, p["point"]["threshold"]) if p["point"] else None} for p in points["precision_targets"]]
        one = next(p["point"] for p in points["budgets"] if p["budget"] == 0.01)
        result["monthly_fixed_1pct_results"] = {str(m): metric_fn(vy[mask], vscores[mask], one["threshold"]) for m in sorted(val["month"].unique()) for mask in [(val["month"] == m).to_numpy()]} if one else {}
        result["promotion_status"] = "NOT_PROMOTED_PENDING_UTILITY_AND_PROVENANCE"
        result["model_binary_logged"] = False
        result["runtime_seconds"] = time.monotonic() - started
        mlflow.log_metrics({"validation_ap": result["exploratory_validation"]["average_precision"], "validation_roc_auc": result["exploratory_validation"]["roc_auc"]})
        mlflow.log_dict(result, "aggregate_results.json")
    return result
