"""Bounded CatBoost challenger; source reads only, sealed 2026 test excluded.

Dependencies are imported inside functions so policy tests need no CatBoost.
Pass the shared V4 feature builder explicitly from the Databricks notebook.
"""
from __future__ import annotations

import gc
import math
import time
from pathlib import Path

SEED = 42
FIT_END = "2025-01-01"
SELECTION_END = "2025-04-01"
OPERATING_END = "2025-07-01"
VALIDATION_END = "2026-01-01"
NEGATIVE_FRACTION = 0.10
MAX_ITERATIONS = 500
MAX_RUNTIME_SECONDS = 3000
EXPERIMENT_PATH = "/Shared/fraud-eda/phase5-catboost-challenger"
NUMERIC_FEATURES = [
    "amount", "log_abs_amount", "amount_sign", "amount_usd_norm",
    "hour", "weekday", "is_weekend", "customer_tx_count_1h",
    "customer_tx_count_24h", "customer_tx_count_7d", "seconds_since_prev_tx",
    "customer_same_currency_tx_count_30d", "customer_same_currency_mean_abs_amount_30d",
    "customer_amount_ratio_30d", "latitude_coarse", "longitude_coarse", "geo_present",
    "customer_merchant_count_30d", "customer_new_merchant_30d",
    "customer_prior_geo_count_30d", "customer_new_geo_30d",
    "geo_distance_km_from_mean_30d_log",
]
CATEGORICAL_FEATURES = [
    "currency", "transaction_type", "channel", "transaction_country",
    "merchant_category", "transaction_category",
]
PREDICTORS = NUMERIC_FEATURES + CATEGORICAL_FEATURES
BUDGETS = (0.001, 0.005, 0.01, 0.02, 0.05, 0.10)
TARGET_PRECISIONS = (0.20, 0.50, 0.80)


def period_for(timestamp: str) -> str:
    """Return a development period; reject sealed-test timestamps."""
    from datetime import datetime
    t = datetime.fromisoformat(timestamp)
    if t.tzinfo is not None:
        from datetime import timezone
        t = t.astimezone(timezone.utc).replace(tzinfo=None)
    if t >= datetime.fromisoformat(VALIDATION_END):
        raise ValueError("Final test is sealed")
    for end, name in [(FIT_END, "fit"), (SELECTION_END, "selection"),
                      (OPERATING_END, "operating_point")]:
        if t < datetime.fromisoformat(end):
            return name
    return "exploratory_validation"


def prediction_metrics(labels, scores, threshold=None) -> dict:
    import numpy as np
    from sklearn.metrics import average_precision_score, roc_auc_score
    if not np.isin(np.asarray(labels), [0, 1]).all():
        raise ValueError("Labels must be binary")
    y, s = np.asarray(labels, dtype=int), np.asarray(scores, dtype=float)
    if len(y) == 0 or len(y) != len(s) or not np.isfinite(s).all():
        raise ValueError("Aligned, finite, nonempty predictions are required")
    if not np.isin(y, [0, 1]).all():
        raise ValueError("Labels must be binary")
    n, positive = len(y), int(y.sum())
    out = {"rows": n, "fraud": positive, "prevalence": positive / n,
           "average_precision": float(average_precision_score(y, s)) if positive else None,
           "roc_auc": float(roc_auc_score(y, s)) if 0 < positive < n else None,
           "distinct_scores": int(len(np.unique(s)))}
    if threshold is not None:
        reviewed = s >= threshold
        tp = int(y[reviewed].sum()); alerts = int(reviewed.sum())
        out.update({"threshold": float(threshold), "alerts": alerts,
                    "tp": tp, "fp": alerts - tp, "fn": positive - tp,
                    "tn": n - positive - (alerts - tp),
                    "precision": tp / alerts if alerts else None,
                    "recall": tp / positive if positive else None,
                    "alert_rate": alerts / n})
    return out


def operating_points(labels, scores, max_alert_rate=0.01, min_alerts=100, min_recall=0.20):
    """Choose complete-score-group thresholds on the designated period only.

    Tied groups are never split using labels or identifiers. A precision target
    with no supported point is explicitly infeasible; no-alert precision is not 1.
    """
    import numpy as np
    if not np.isin(np.asarray(labels), [0, 1]).all():
        raise ValueError("Labels must be binary")
    y, s = np.asarray(labels, dtype=int), np.asarray(scores, dtype=float)
    if len(y) == 0 or len(y) != len(s) or not np.isfinite(s).all():
        raise ValueError("Aligned finite predictions required")
    if not np.isin(y, [0, 1]).all() or not 0 < max_alert_rate <= 1:
        raise ValueError("Invalid labels or alert rate")
    order = np.argsort(-s, kind="stable")
    sorted_scores, sorted_y = s[order], y[order]
    ends = np.r_[np.flatnonzero(sorted_scores[:-1] != sorted_scores[1:]), len(y) - 1]
    thresholds = sorted_scores[ends]
    alerts = ends + 1
    tp = np.cumsum(sorted_y)[ends]
    precision = tp / alerts
    positives = int(y.sum())
    recall = tp / positives if positives else np.zeros(len(ends))

    def point(index):
        if index is None:
            return None
        a, t = int(alerts[index]), int(tp[index])
        return {"threshold": float(thresholds[index]), "alerts": a, "tp": t,
                "fp": a - t, "precision": float(precision[index]),
                "recall": float(recall[index]) if positives else None,
                "alert_rate": a / len(y)}

    budgets = []
    for budget in BUDGETS:
        feasible = np.flatnonzero(alerts / len(y) <= budget)
        chosen = int(feasible[-1]) if len(feasible) else None
        budgets.append({"budget": budget, "point": point(chosen)})
    targets = []
    for target in TARGET_PRECISIONS:
        valid = np.flatnonzero((precision >= target) & (recall >= min_recall)
                               & (alerts >= min_alerts) & (alerts / len(y) <= max_alert_rate))
        # Most true positives, then smaller alert workload for equal TP.
        best = int(valid[np.lexsort((alerts[valid], -tp[valid]))[0]]) if len(valid) else None
        targets.append({"target_precision": target, "feasible": best is not None,
                        "point": point(best)})
    return {"budgets": budgets, "precision_targets": targets,
            "constraints": {"min_alerts": min_alerts, "min_recall": min_recall,
                            "max_alert_rate": max_alert_rate}}


def prepare_inputs(frame, medians, with_flags=False):
    """Fit-period medians are reused; keys and labels never enter X."""
    import numpy as np
    import pandas as pd
    result = pd.DataFrame(index=frame.index)
    for name in NUMERIC_FEATURES:
        values = pd.to_numeric(frame[name], errors="coerce").replace([np.inf, -np.inf], np.nan)
        if with_flags:
            result[name + "_missing"] = values.isna().astype("float64")
        result[name] = values.fillna(medians[name]).astype("float64")
    for name in CATEGORICAL_FEATURES:
        result[name] = frame[name].fillna("__missing__").astype(str)
    if with_flags:
        result["has_prior_amount_support"] = (result["customer_same_currency_tx_count_30d"] >= 5).astype(float)
        result["has_observed_prior_geo"] = (result["customer_prior_geo_count_30d"] > 0).astype(float)
    return result


def available_memory_bytes():
    """Respect both physical availability and Linux cgroup headroom."""
    values = {}
    for line in Path("/proc/meminfo").read_text().splitlines():
        k, value = line.split(":", 1)
        values[k] = int(value.strip().split()[0]) * 1024
    headroom = values["MemAvailable"]
    for root in [Path("/sys/fs/cgroup"), Path("/sys/fs/cgroup/memory")]:
        for limit_file, usage_file in [("memory.max", "memory.current"),
                                       ("memory.limit_in_bytes", "memory.usage_in_bytes")]:
            try:
                limit = int((root / limit_file).read_text().strip())
                used = int((root / usage_file).read_text().strip())
                if limit < 2**60:
                    headroom = min(headroom, max(0, limit - used))
            except (OSError, ValueError):
                pass
    return headroom


def run_v5(spark, mlflow, feature_builder) -> dict:
    import numpy as np
    import pandas as pd
    import catboost
    from catboost import CatBoostClassifier, Pool
    from sklearn.metrics import average_precision_score, roc_auc_score
    from pyspark.sql import functions as F

    started = time.monotonic()
    frame = feature_builder(spark, end_exclusive=VALIDATION_END).withColumn(
        "period", F.when(F.col("transaction_date") < F.to_timestamp(F.lit(FIT_END)), "fit")
        .when(F.col("transaction_date") < F.to_timestamp(F.lit(SELECTION_END)), "selection")
        .when(F.col("transaction_date") < F.to_timestamp(F.lit(OPERATING_END)), "operating_point")
        .otherwise("exploratory_validation"),
    )
    counts = {r["period"]: {"rows": int(r["rows"]), "fraud": int(r["fraud"])}
              for r in frame.groupBy("period").agg(F.count("label").alias("rows"),
                                                   F.sum("label").alias("fraud")).collect()}
    if set(counts) != {"fit", "selection", "operating_point", "exploratory_validation"}:
        raise ValueError(f"Missing development period: {counts}")
    for item in counts.values():
        if not 0 < item["fraud"] < item["rows"]:
            raise ValueError("Each period needs both label classes")

    sampled_fit = frame.where(F.col("period") == "fit").where(
        (F.col("label") == 1) | (F.pmod(F.xxhash64("transaction_id", F.lit(SEED)), F.lit(1_000_000)) < int(NEGATIVE_FRACTION * 1_000_000))
    ).orderBy("transaction_date", "transaction_id")
    sampled_count = sampled_fit.count()
    result = {"source_table": "workspace.bank_silver.transactions", "delta_version": 1,
              "feature_version": "v5_v4_catboost_capacity", "final_test_used": False,
              "source_tables_modified": False, "row_level_records_exported": False,
              "seed": SEED, "split_counts": counts,
              "boundaries": {"fit_end": FIT_END, "selection_end": SELECTION_END,
                             "operating_end": OPERATING_END, "validation_end": VALIDATION_END},
              "sampling": {"negative_inclusion_probability": NEGATIVE_FRACTION,
                           "positives_retained": "all fit-period positives",
                           "inverse_inclusion_weights": True, "sampled_fit_rows": sampled_count,
                           "evaluation_sampled": False},
              "libraries": {"catboost": catboost.__version__, "pandas": pd.__version__, "numpy": np.__version__},
              "metric_primary": "sklearn average_precision_score; not directly interchangeable with Spark areaUnderPR",
              "provenance": "Unverified organizer labels; retrospective synthetic-data experiment only",
              "memory_checks": [], "attempts": []}

    def load_checked(df, expected_rows, label):
        # Drop identifiers in Spark before transferring even pilot rows.
        df = df.select("label", "period", F.date_format("transaction_date", "yyyy-MM").alias("month"), *PREDICTORS)
        pilot = df.limit(256).toPandas()
        bytes_per_row = float(pilot.memory_usage(deep=True).sum()) / max(1, len(pilot))
        estimated_peak = int(bytes_per_row * expected_rows * 3)
        available = available_memory_bytes()
        limit = min(int(available * 0.45), 2 * 1024**3)
        record = {"period": label, "rows": expected_rows, "pilot_bytes_per_row": bytes_per_row,
                  "estimated_peak_bytes": estimated_peak, "available_bytes": available, "limit_bytes": limit}
        result["memory_checks"].append(record)
        print("V5 memory check:", record, flush=True)
        if estimated_peak > limit:
            raise MemoryError(f"Collect blocked by driver memory guard: {record}")
        data = df.toPandas()
        if len(data) != expected_rows:
            raise ValueError(f"Unexpected row count in {label}: {len(data)} != {expected_rows}")
        return data

    fit = load_checked(sampled_fit, sampled_count, "sampled_fit")
    selection = load_checked(frame.where(F.col("period") == "selection"), counts["selection"]["rows"], "selection")
    fit_y = fit["label"].to_numpy(dtype=int)
    if int(fit_y.sum()) != counts["fit"]["fraud"]:
        raise ValueError("Negative sampling lost training positives")
    medians = {}
    for column in NUMERIC_FEATURES:
        value = pd.to_numeric(fit[column], errors="coerce").replace([np.inf, -np.inf], np.nan).median()
        medians[column] = float(value) if pd.notna(value) else 0.0
    result["preprocessing"] = "V4 predictors; sampled fit-period median imputation; native categorical encoding; chronological has_time; C3 adds missingness/support flags."
    result["medians"] = medians
    result["feature_diagnostics"] = {
        "fit_missing_fraction": {c: float(fit[c].isna().mean()) for c in NUMERIC_FEATURES},
        "fit_distinct_values": {c: int(fit[c].nunique(dropna=False)) for c in PREDICTORS},
    }
    result["feature_diagnostics"]["selection_unknown_category_fraction"] = {
        c: float((~selection[c].isin(set(fit[c]))).mean()) for c in CATEGORICAL_FEATURES
    }
    sample_weights = np.where(fit_y == 1, 1.0, 1.0 / NEGATIVE_FRACTION)
    selection_y = selection["label"].to_numpy(dtype=int)
    xfit = prepare_inputs(fit, medians)
    xselection = prepare_inputs(selection, medians)
    fit_pool = Pool(xfit, fit_y, cat_features=CATEGORICAL_FEATURES, weight=sample_weights)
    selection_pool = Pool(xselection, selection_y, cat_features=CATEGORICAL_FEATURES)
    mlflow.set_experiment(EXPERIMENT_PATH)
    best = None
    with mlflow.start_run(run_name="V5_catboost_capacity") as parent:
        result["mlflow_parent_run_id"] = parent.info.run_id
        mlflow.set_tags({"phase": "V5", "test_accessed": "false", "promotion": "none"})
        mlflow.log_params({"delta_version": 1, "negative_fraction": NEGATIVE_FRACTION,
                           "fit_end": FIT_END, "selection_end": SELECTION_END, "seed": SEED})
        for candidate_id, weight, flags in [("C0", 1, False), ("C1", 20, False), ("C2", 100, False), ("C3", None, True)]:
            if time.monotonic() - started > MAX_RUNTIME_SECONDS:
                raise TimeoutError("V5 runtime budget exhausted before remaining fits")
            if flags:
                if best is None:
                    raise RuntimeError("No successful base candidate")
                weight = best["weight"]
                del fit_pool, selection_pool, xfit, xselection
                gc.collect()
                xfit = prepare_inputs(fit, medians, True)
                xselection = prepare_inputs(selection, medians, True)
                fit_pool = Pool(xfit, fit_y, cat_features=CATEGORICAL_FEATURES, weight=sample_weights)
                selection_pool = Pool(xselection, selection_y, cat_features=CATEGORICAL_FEATURES)
            with mlflow.start_run(run_name=candidate_id, nested=True) as child:
                candidate_started = time.monotonic()
                model = CatBoostClassifier(
                    iterations=MAX_ITERATIONS, depth=6, learning_rate=0.05, l2_leaf_reg=10,
                    loss_function="Logloss", eval_metric="PRAUC:type=Classic;use_weights=false",
                    class_weights=[1, weight], random_seed=SEED, thread_count=4,
                    task_type="CPU", has_time=True, allow_writing_files=False,
                    early_stopping_rounds=50, verbose=100,
                )
                model.fit(fit_pool, eval_set=selection_pool, use_best_model=True)
                scores = model.predict_proba(selection_pool)[:, 1]
                metrics = prediction_metrics(selection_y, scores)
                fitted_scores = model.predict_proba(fit_pool)[:, 1]
                record = {"candidate": candidate_id, "positive_class_weight": weight,
                          "missing_flags": flags, "run_id": child.info.run_id,
                          "effective_iterations": int(model.tree_count_), "selection": metrics,
                          "train_inverse_weighted_ap_estimate": float(average_precision_score(fit_y, fitted_scores, sample_weight=sample_weights)),
                          "train_inverse_weighted_roc_estimate": float(roc_auc_score(fit_y, fitted_scores, sample_weight=sample_weights)),
                          "runtime_seconds": time.monotonic() - candidate_started}
                result["attempts"].append(record)
                mlflow.log_params({"weight": weight, "missing_flags": flags, "depth": 6,
                                   "max_iterations": MAX_ITERATIONS, "learning_rate": 0.05, "l2_leaf_reg": 10})
                mlflow.log_metrics({"selection_ap": metrics["average_precision"], "selection_roc_auc": metrics["roc_auc"],
                                    "effective_iterations": model.tree_count_})
                print("V5 candidate result:", record, flush=True)
                if best is None or metrics["average_precision"] > best["record"]["selection"]["average_precision"]:
                    best = {"model": model, "weight": weight, "flags": flags, "record": record}
        chosen = best["model"]
        chosen_flags = best["flags"]
        result["selected_candidate"] = best["record"]
        result["feature_allowlist"] = list(xfit.columns) if chosen_flags else PREDICTORS
        result["feature_importances"] = {n: float(v) for n, v in zip(chosen.feature_names_, chosen.feature_importances_)}
        del fit, selection, fit_pool, selection_pool, xfit, xselection, model, fitted_scores, scores, fit_y, selection_y, sample_weights
        gc.collect()

        def score_period(name):
            data = load_checked(frame.where(F.col("period") == name), counts[name]["rows"], name)
            x = prepare_inputs(data, medians, chosen_flags)
            scores = chosen.predict_proba(x)[:, 1]
            labels = data["label"].to_numpy(dtype=int)
            return data, labels, scores

        op_data, op_y, op_scores = score_period("operating_point")
        operating = operating_points(op_y, op_scores)
        result["operating_period"] = {"metrics": prediction_metrics(op_y, op_scores), "points": operating}
        # Thresholds are frozen before inspecting exploratory validation scores.
        frozen = [dict(item) for item in operating["budgets"]]
        targets = [dict(item) for item in operating["precision_targets"]]
        del op_data, op_y, op_scores
        gc.collect()
        val_data, val_y, val_scores = score_period("exploratory_validation")
        result["exploratory_validation"] = prediction_metrics(val_y, val_scores)
        result["exploratory_validation"]["frozen_budget_results"] = [
            {"budget_selected_on_operating_period": item["budget"],
             "metrics": prediction_metrics(val_y, val_scores, item["point"]["threshold"]) if item["point"] else None}
            for item in frozen
        ]
        result["exploratory_validation"]["frozen_precision_target_results"] = [
            {"target_precision": item["target_precision"], "feasible_on_operating_period": item["feasible"],
             "metrics": prediction_metrics(val_y, val_scores, item["point"]["threshold"]) if item["point"] else None}
            for item in targets
        ]
        result["exploratory_validation"]["descriptive_own_budget_curve"] = operating_points(val_y, val_scores)
        fixed_budget = next(p["point"] for p in frozen if p["budget"] == 0.01)
        result["slices_at_frozen_1pct_threshold"] = {}
        if fixed_budget:
            for col in ["month", "transaction_country", "channel"]:
                result["slices_at_frozen_1pct_threshold"][col] = {
                    str(value): prediction_metrics(val_y[mask], val_scores[mask], fixed_budget["threshold"])
                    for value in sorted(val_data[col].dropna().unique())
                    for mask in [(val_data[col] == value).to_numpy()]
                }
        result["promotion_status"] = "NOT_PROMOTED_UNVERIFIED_LABEL_PROVENANCE"
        result["model_binary_logged"] = False
        result["runtime_seconds"] = time.monotonic() - started
        mlflow.log_metrics({"exploratory_validation_ap": result["exploratory_validation"]["average_precision"],
                            "exploratory_validation_roc_auc": result["exploratory_validation"]["roc_auc"]})
        mlflow.log_dict(result, "aggregate_results.json")
    return result
