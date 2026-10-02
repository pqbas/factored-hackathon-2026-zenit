"""Phase 2 fraud-model training on Databricks Spark ML.

The notebook calls :func:`run_training` after importing this module. The code
reads one pinned Delta snapshot, fits preprocessing on the training period
only, tunes on temporal validation, and never reads final-test labels.
"""

from __future__ import annotations

import json
import math
import time
from typing import Any, Iterable, Optional, Sequence


SOURCE_TABLE = "workspace.bank_silver.transactions"
DELTA_VERSION = 1
TRAIN_END = "2025-07-01"
VALIDATION_END = "2026-01-01"
SEED = 42
FEATURE_VERSION = "v1"
REVIEW_BUDGET = 0.10
EXPERIMENT_PATH = "/Shared/fraud-eda/phase2-training"

NUMERIC_FEATURES = [
    "amount", "log_abs_amount", "amount_sign", "amount_usd_norm",
    "hour", "weekday", "is_weekend",
]
CATEGORICAL_FEATURES = [
    "currency", "transaction_type", "channel", "transaction_country",
    "merchant_category",
]
PREDICTORS = NUMERIC_FEATURES + CATEGORICAL_FEATURES
RAW_SOURCE_FEATURES = [
    "amount", "currency", "amount_usd", "transaction_type", "channel",
    "transaction_country", "merchant_category",
]


def run_smoke(spark, sample_fraction: float = 0.01) -> dict[str, Any]:
    """Train tiny train-period Spark ML models to estimate compatibility/cost."""
    from pyspark.ml import Pipeline
    from pyspark.ml.classification import DecisionTreeClassifier, LogisticRegression
    from pyspark.ml.feature import Imputer, OneHotEncoder, StringIndexer, VectorAssembler
    from pyspark.sql import functions as F

    if not 0 < sample_fraction <= 0.05:
        raise ValueError("Smoke sample_fraction must be in (0, 0.05].")
    spark.conf.set("spark.sql.session.timeZone", "UTC")
    source = spark.read.option("versionAsOf", DELTA_VERSION).table(SOURCE_TABLE)
    required = {"transaction_date", "is_fraud", *RAW_SOURCE_FEATURES}
    missing = sorted(required - set(source.columns))
    if missing:
        raise ValueError(f"Required source columns are missing: {missing}")
    raw = (
        source.where(F.col("transaction_date") < F.to_timestamp(F.lit(TRAIN_END)))
        .select("transaction_date", "is_fraud", *RAW_SOURCE_FEATURES)
        .sample(False, sample_fraction, seed=SEED)
        .withColumn("label", F.col("is_fraud").cast("double"))
        .where(F.col("label").isin(0.0, 1.0))
        .withColumn("amount", F.col("amount").cast("double"))
        .withColumn("log_abs_amount", F.log1p(F.abs(F.col("amount"))))
        .withColumn("amount_sign", F.when(F.col("amount") > 0, 1.0).when(F.col("amount") < 0, -1.0).otherwise(0.0))
        .withColumn("amount_usd_norm", F.when(F.upper(F.trim("currency")) == "USD", F.col("amount")).otherwise(F.col("amount_usd").cast("double")))
        .withColumn("hour", F.hour("transaction_date").cast("double"))
        .withColumn("weekday", F.pmod(F.dayofweek("transaction_date") + 5, 7).cast("double"))
        .withColumn("is_weekend", F.when(F.dayofweek("transaction_date").isin(1, 7), 1.0).otherwise(0.0))
    )
    for column in CATEGORICAL_FEATURES:
        raw = raw.withColumn(column, F.coalesce(F.nullif(F.trim(F.col(column).cast("string")), F.lit("")), F.lit("__missing__")))
    for column in NUMERIC_FEATURES:
        raw = raw.withColumn(column, F.col(column).cast("double"))
        raw = raw.withColumn(column, F.when(F.isnan(column), F.lit(None).cast("double")).otherwise(F.col(column)))
        raw = raw.withColumn(column, F.coalesce(F.col(column), F.lit(float("nan"))))
    count_row = raw.agg(F.count(F.lit(1)).alias("rows"), F.sum("label").alias("fraud")).first()
    count, positives = int(count_row["rows"]), int(count_row["fraud"] or 0)
    if positives < 2 or positives >= count:
        raise ValueError(f"Smoke sample has insufficient label support: rows={count}, fraud={positives}")

    idx = [f"{c}_idx" for c in CATEGORICAL_FEATURES]
    ohe = [f"{c}_ohe" for c in CATEGORICAL_FEATURES]
    imputed = [f"{c}_imputed" for c in NUMERIC_FEATURES]
    pipeline = Pipeline(stages=[
        Imputer(inputCols=NUMERIC_FEATURES, outputCols=imputed, strategy="median"),
        StringIndexer(inputCols=CATEGORICAL_FEATURES, outputCols=idx, handleInvalid="keep"),
        OneHotEncoder(inputCols=idx, outputCols=ohe, handleInvalid="keep", dropLast=False),
        VectorAssembler(inputCols=imputed + ohe, outputCol="features"),
    ])
    start = time.monotonic()
    transformed = pipeline.fit(raw).transform(raw).select("label", "features")
    negative_weight = count / (2.0 * (count - positives))
    positive_weight = count / (2.0 * positives)
    weighted = transformed.withColumn("class_weight", F.when(F.col("label") == 1, positive_weight).otherwise(negative_weight))
    lr_start = time.monotonic()
    LogisticRegression(featuresCol="features", labelCol="label", weightCol="class_weight", maxIter=30, regParam=1.0).fit(weighted)
    lr_seconds = time.monotonic() - lr_start
    tree_start = time.monotonic()
    DecisionTreeClassifier(featuresCol="features", labelCol="label", weightCol="class_weight", maxDepth=3, minInstancesPerNode=100, seed=SEED).fit(weighted)
    tree_seconds = time.monotonic() - tree_start
    return {
        "status": "SUCCESS", "source_table": SOURCE_TABLE, "delta_version": DELTA_VERSION,
        "sample_fraction": sample_fraction, "train_only": True, "rows": count, "fraud": positives,
        "approximate_full_train_rows": int(count / sample_fraction),
        "logistic_seconds": lr_seconds, "tree_seconds": tree_seconds,
        "total_seconds": time.monotonic() - start,
        "purpose": "runtime and Spark ML compatibility only; not a model-quality result",
    }


def budget_threshold_from_counts(
    score_counts: Iterable[tuple[float, int, int]], total_rows: int, budget: float
) -> Optional[float]:
    """Choose the lowest score threshold whose complete tie group fits budget.

    ``score_counts`` contains (score, rows at score, positives at score).
    This pure helper is shared with tests; it never splits equal scores.
    """
    if total_rows <= 0 or not 0 < budget <= 1:
        return None
    capacity = math.floor(total_rows * budget)
    used = 0
    selected = None
    for score, count, _positives in sorted(score_counts, key=lambda row: row[0], reverse=True):
        if used + count > capacity:
            break
        used += count
        selected = float(score)
    return selected


def _metric_ratio(numerator: int, denominator: int) -> Optional[float]:
    return numerator / denominator if denominator else None


def _json_number(value: Any) -> Optional[float]:
    if value is None:
        return None
    number = float(value)
    return number if math.isfinite(number) else None


def run_training(spark, mlflow) -> dict[str, Any]:
    """Train B0/B1/M1/M2, select on validation, log evidence to MLflow."""
    from pyspark.ml import Pipeline
    from pyspark.ml.classification import DecisionTreeClassifier, LogisticRegression
    from pyspark.ml.evaluation import BinaryClassificationEvaluator
    from pyspark.ml.feature import (
        Imputer,
        OneHotEncoder,
        StringIndexer,
        VectorAssembler,
    )
    from pyspark.ml.functions import vector_to_array
    from pyspark.ml.pipeline import PipelineModel
    from pyspark.sql import functions as F
    from pyspark.sql import Window

    started = time.monotonic()
    spark.conf.set("spark.sql.session.timeZone", "UTC")
    mlflow.set_experiment(EXPERIMENT_PATH)

    required = {
        "transaction_id", "transaction_date", "is_fraud", "amount", "currency",
        "amount_usd", "transaction_type", "channel", "transaction_country",
        "merchant_category",
    }
    source = spark.read.option("versionAsOf", DELTA_VERSION).table(SOURCE_TABLE)
    missing = sorted(required - set(source.columns))
    if missing:
        raise ValueError(f"Required source columns are missing: {missing}")

    # Exclude all final-test timestamps at source-read time. IDs remain only
    # for deterministic ranking and are never included in the feature vector.
    raw = (
        source.where(F.col("transaction_date") < F.to_timestamp(F.lit(VALIDATION_END)))
        .select(*sorted(required))
        .withColumn("label", F.col("is_fraud").cast("double"))
        .where(F.col("transaction_date").isNotNull() & F.col("label").isin(0.0, 1.0))
        .withColumn("split", F.when(F.col("transaction_date") < F.to_timestamp(F.lit(TRAIN_END)), F.lit("train")).otherwise(F.lit("validation")))
    )

    date_scope = raw.groupBy("split").agg(
        F.count(F.lit(1)).alias("rows"),
        F.sum("label").alias("fraud"),
        F.min("transaction_date").cast("string").alias("min_date"),
        F.max("transaction_date").cast("string").alias("max_date"),
    ).collect()
    split_summary = {r["split"]: {k: r[k] for k in r.asDict()} for r in date_scope}
    for split in ("train", "validation"):
        item = split_summary.get(split)
        if not item or not item["rows"] or not item["fraud"] or item["fraud"] >= item["rows"]:
            raise ValueError(f"Both label classes are required in {split}: {item}")

    # Match the V1 helper: Python Monday=0, Spark dayofweek Sunday=1.
    features = raw
    amount = F.col("amount").cast("double")
    features = (
        features
        .withColumn("amount", amount)
        .withColumn("log_abs_amount", F.log1p(F.abs(amount)))
        .withColumn("amount_sign", F.when(amount > 0, 1.0).when(amount < 0, -1.0).otherwise(0.0))
        .withColumn("amount_usd_norm", F.when(F.upper(F.trim("currency")) == "USD", amount).otherwise(F.col("amount_usd").cast("double")))
        .withColumn("hour", F.hour("transaction_date").cast("double"))
        .withColumn("weekday", F.pmod(F.dayofweek("transaction_date") + F.lit(5), F.lit(7)).cast("double"))
        .withColumn("is_weekend", F.when(F.dayofweek("transaction_date").isin(1, 7), 1.0).otherwise(0.0))
    )
    for column in CATEGORICAL_FEATURES:
        features = features.withColumn(
            column,
            F.coalesce(F.nullif(F.trim(F.col(column).cast("string")), F.lit("")), F.lit("__missing__")),
        )
    for column in NUMERIC_FEATURES:
        features = features.withColumn(column, F.col(column).cast("double"))
        features = features.withColumn(column, F.when(F.isnan(column), F.lit(None).cast("double")).otherwise(F.col(column)))

    feature_frame = features.select("transaction_id", "split", "label", *PREDICTORS)
    train_raw = feature_frame.where(F.col("split") == "train").drop("split")
    validation_raw = feature_frame.where(F.col("split") == "validation").drop("split")

    # Replace NULL with NaN for Spark Imputer; its fitted medians see train only.
    for column in NUMERIC_FEATURES:
        train_raw = train_raw.withColumn(column, F.coalesce(F.col(column), F.lit(float("nan"))))
        validation_raw = validation_raw.withColumn(column, F.coalesce(F.col(column), F.lit(float("nan"))))

    indexed = [f"{name}_idx" for name in CATEGORICAL_FEATURES]
    encoded = [f"{name}_ohe" for name in CATEGORICAL_FEATURES]
    imputed = [f"{name}_imputed" for name in NUMERIC_FEATURES]
    preprocessing = Pipeline(stages=[
        Imputer(inputCols=NUMERIC_FEATURES, outputCols=imputed, strategy="median"),
        StringIndexer(inputCols=CATEGORICAL_FEATURES, outputCols=indexed, handleInvalid="keep"),
        OneHotEncoder(inputCols=indexed, outputCols=encoded, handleInvalid="keep", dropLast=False),
        VectorAssembler(inputCols=imputed + encoded, outputCol="features", handleInvalid="error"),
    ])
    prep_model = preprocessing.fit(train_raw)
    train = prep_model.transform(train_raw).select(
        "transaction_id", "label", "features", "transaction_country", "channel"
    )
    validation = prep_model.transform(validation_raw).select(
        "transaction_id", "label", "features", "transaction_country", "channel"
    )
    train_count = int(split_summary["train"]["rows"])
    validation_count = int(split_summary["validation"]["rows"])
    train_positive = int(split_summary["train"]["fraud"])
    train_negative = train_count - train_positive
    validation_positive = int(split_summary["validation"]["fraud"])

    evaluator = BinaryClassificationEvaluator(
        labelCol="label", rawPredictionCol="rawPrediction", metricName="areaUnderPR"
    )
    auc_evaluator = BinaryClassificationEvaluator(
        labelCol="label", rawPredictionCol="rawPrediction", metricName="areaUnderROC"
    )

    summary: dict[str, Any] = {
        "source_table": SOURCE_TABLE,
        "delta_version": DELTA_VERSION,
        "feature_version": FEATURE_VERSION,
        "train_end_exclusive": TRAIN_END,
        "validation_end_exclusive": VALIDATION_END,
        "final_test_used": False,
        "seed": SEED,
        "review_budget_assumption": REVIEW_BUDGET,
        "split_counts": split_summary,
        "feature_allowlist": PREDICTORS,
        "preprocessing": "Median imputation and categorical indexers fitted on train only; one-hot encoding; no sampling.",
        "metric_primary": "Spark BinaryClassificationEvaluator areaUnderPR (stepwise PR area).",
        "attempts": [],
    }
    best_record = None
    candidate_models = []

    def class_weights(mode: str):
        if mode == "none":
            return train.withColumn("class_weight", F.lit(1.0))
        positive_weight = train_count / (2.0 * train_positive)
        negative_weight = train_count / (2.0 * train_negative)
        return train.withColumn(
            "class_weight",
            F.when(F.col("label") == 1.0, F.lit(positive_weight)).otherwise(F.lit(negative_weight)),
        )

    def attempt(model_id: str, params: dict[str, Any], estimator):
        nonlocal best_record
        run_name = model_id + "_" + "_".join(f"{key}-{value}" for key, value in params.items())
        run_started = time.monotonic()
        attempt_record: dict[str, Any] = {"model": model_id, "params": params, "status": "FAILED"}
        with mlflow.start_run(run_name=run_name, nested=True) as child:
            mlflow.set_tags({
                "phase": "2", "feature_version": FEATURE_VERSION,
                "source_table": SOURCE_TABLE, "delta_version": str(DELTA_VERSION),
                "split": "temporal_train_validation", "seed": str(SEED),
                "test_accessed": "false",
            })
            mlflow.log_params({**params, "model_id": model_id, "feature_version": FEATURE_VERSION, "delta_version": DELTA_VERSION})
            try:
                weighted_train = class_weights(params.get("class_weight", "none"))
                fitted = estimator.fit(weighted_train.select("label", "features", "class_weight"))
                predictions = fitted.transform(validation).select(
                    "label", "rawPrediction", "probability"
                )
                ap = float(evaluator.evaluate(predictions))
                elapsed = time.monotonic() - run_started
                metrics = {
                    "validation_area_under_pr": ap,
                    "validation_rows": validation_count,
                    "validation_positives": validation_positive,
                    "validation_prevalence": validation_positive / validation_count,
                    "training_rows": train_count,
                    "training_positives": train_positive,
                    "runtime_seconds": elapsed,
                }
                converged = None
                iterations = None
                if model_id == "M1_logistic_regression" and fitted.hasSummary:
                    iterations = int(fitted.summary.totalIterations)
                    converged = iterations < int(params["max_iter"])
                    metrics["iterations"] = iterations
                    mlflow.log_metric("iterations", iterations)
                    mlflow.set_tag("converged", str(converged).lower())
                mlflow.log_metrics(metrics)
                attempt_record.update({"status": "SUCCESS", "run_id": child.info.run_id, **metrics, "converged": converged})
                candidate = {
                    "record": attempt_record,
                    "fitted": fitted,
                    "params": params,
                    "model_id": model_id,
                    "mlflow_run_id": child.info.run_id,
                }
                candidate_models.append(candidate)
                if best_record is None or ap > best_record["record"]["validation_area_under_pr"]:
                    best_record = candidate
            except Exception as exc:
                attempt_record.update({"failure_type": type(exc).__name__, "failure_message": str(exc)[:1000]})
                mlflow.set_tag("failure_type", type(exc).__name__)
                mlflow.set_tag("failure_message", str(exc)[:500])
            summary["attempts"].append(attempt_record)

    with mlflow.start_run(run_name="fraud_phase2_temporal_model_comparison") as parent:
        mlflow.set_tags({
            "phase": "2", "feature_version": FEATURE_VERSION,
            "source_table": SOURCE_TABLE, "delta_version": str(DELTA_VERSION),
            "test_accessed": "false", "seed": str(SEED),
        })
        mlflow.log_params({
            "feature_version": FEATURE_VERSION,
            "source_table": SOURCE_TABLE,
            "delta_version": DELTA_VERSION,
            "train_end_exclusive": TRAIN_END,
            "validation_end_exclusive": VALIDATION_END,
            "seed": SEED,
            "review_budget_assumption": REVIEW_BUDGET,
            "class_sampling": "none",
        })
        train_prevalence = train_positive / train_count
        # A constant ranking ties every row, so its AP equals validation prevalence.
        baseline_ap = validation_positive / validation_count
        summary["baselines"] = {
            "B0_constant_train_prevalence": {
                "score": train_prevalence,
                "validation_area_under_pr": baseline_ap,
                "validation_rows": validation_count,
                "validation_positives": validation_positive,
            },
            "B1_always_non_fraud": {
                "accuracy": 1.0 - validation_positive / validation_count,
                "recall": 0.0,
                "validation_rows": validation_count,
                "validation_positives": validation_positive,
                "warning": "High accuracy is uninformative under severe class imbalance.",
            },
        }
        mlflow.log_metrics({
            "b0_validation_area_under_pr": baseline_ap,
            "b1_validation_accuracy": 1.0 - validation_positive / validation_count,
            "validation_prevalence": validation_positive / validation_count,
        })

        # Serverless does not allow DataFrame.persist/cache. Keep the run
        # budget bounded: one regularization level per logistic variant and
        # one conservative tree shape, each with and without class weights.
        for class_weight in ("none", "balanced"):
            c_value = 1.0
            params = {"class_weight": class_weight, "C": c_value, "max_iter": 100, "seed": SEED}
            lr = LogisticRegression(
                featuresCol="features", labelCol="label", weightCol="class_weight",
                regParam=1.0 / c_value, elasticNetParam=0.0, maxIter=100,
                tol=1e-6, standardization=True,
            )
            attempt("M1_logistic_regression", params, lr)

        for class_weight in ("none", "balanced"):
            depth, min_leaf = 5, 1000
            params = {
                "class_weight": class_weight, "max_depth": depth,
                "min_instances_per_node": min_leaf, "seed": SEED,
            }
            tree = DecisionTreeClassifier(
                featuresCol="features", labelCol="label", weightCol="class_weight",
                maxDepth=depth, minInstancesPerNode=min_leaf, seed=SEED,
                impurity="gini",
            )
            attempt("M2_decision_tree", params, tree)

        fit_successful = [a for a in summary["attempts"] if a["status"] == "SUCCESS"]
        successful = [
            a for a in fit_successful
            if a["model"] != "M1_logistic_regression" or a.get("converged") is True
        ]
        summary["non_converged_logistic_attempts"] = [
            a for a in fit_successful
            if a["model"] == "M1_logistic_regression" and a.get("converged") is not True
        ]
        if not successful:
            raise RuntimeError("No M1/M2 model completed successfully; failures are logged in MLflow.")

        maximum_ap = max(a["validation_area_under_pr"] for a in successful)
        summary["best_validation_area_under_pr"] = maximum_ap
        summary["selected_candidate"] = best_record["record"]
        summary["area_under_pr_lift_over_b0"] = maximum_ap - baseline_ap
        tied = [a for a in successful if maximum_ap - a["validation_area_under_pr"] <= 0.001]
        # Prefer the simpler linear model for an AP practical tie; for trees,
        # prefer shallower depth and larger leaves.
        def simplicity(record):
            if record["model"] == "M1_logistic_regression":
                return (0, record["params"]["C"], record["params"]["class_weight"] != "none")
            p = record["params"]
            return (1, p["max_depth"], -p["min_instances_per_node"], p["class_weight"] != "none")
        preferred = min(tied, key=simplicity)
        selected = next(item for item in candidate_models if item["record"]["run_id"] == preferred["run_id"])
        summary["selected_candidate"] = selected["record"]
        summary["selection_note"] = "Candidates within 0.001 areaUnderPR of the best are practical ties; selected the simplest model among them."
        summary["selected_model"] = selected["model_id"]
        summary["selected_params"] = selected["params"]
        summary["selected_validation_run_id"] = selected["mlflow_run_id"]

        fitted_full = PipelineModel(stages=prep_model.stages + [selected["fitted"]])
        mlflow.spark.log_model(fitted_full, artifact_path="selected_model")
        if selected["model_id"] == "M2_decision_tree":
            summary["selected_tree_rules"] = selected["fitted"].toDebugString

        selected_predictions = selected["fitted"].transform(validation).select(
            "transaction_id", "label", "probability", "rawPrediction",
            "transaction_country", "channel",
        ).withColumn("score", vector_to_array("probability")[1])
        selected_auc = float(auc_evaluator.evaluate(selected_predictions))
        summary["selected_validation_auc_roc"] = selected_auc

        score_groups = selected_predictions.groupBy("score").agg(
            F.count(F.lit(1)).alias("rows"), F.sum("label").alias("positives")
        ).orderBy(F.col("score").desc())
        tie_window = Window.orderBy(F.col("score").desc()).rowsBetween(Window.unboundedPreceding, Window.currentRow)
        score_groups = score_groups.withColumn("cumulative_rows", F.sum("rows").over(tie_window))
        allowed_thresholds = score_groups.where(F.col("cumulative_rows") <= F.floor(F.lit(validation_count * REVIEW_BUDGET)))
        threshold_row = allowed_thresholds.orderBy(F.col("cumulative_rows").desc()).first()
        threshold = float(threshold_row["score"]) if threshold_row else None
        summary["validation_threshold_for_10pct_review_budget"] = threshold

        if threshold is not None:
            binary = selected_predictions.withColumn("predicted", (F.col("score") >= F.lit(threshold)).cast("int"))
            conf = binary.agg(
                F.sum(F.when((F.col("label") == 1) & (F.col("predicted") == 1), 1).otherwise(0)).alias("tp"),
                F.sum(F.when((F.col("label") == 0) & (F.col("predicted") == 1), 1).otherwise(0)).alias("fp"),
                F.sum(F.when((F.col("label") == 0) & (F.col("predicted") == 0), 1).otherwise(0)).alias("tn"),
                F.sum(F.when((F.col("label") == 1) & (F.col("predicted") == 0), 1).otherwise(0)).alias("fn"),
            ).first().asDict()
            tp, fp, tn, fn = (int(conf[k] or 0) for k in ("tp", "fp", "tn", "fn"))
            summary["validation_at_threshold"] = {
                "threshold": threshold,
                "tp": tp, "fp": fp, "tn": tn, "fn": fn,
                "precision": _metric_ratio(tp, tp + fp),
                "recall": _metric_ratio(tp, tp + fn),
                "f1": _metric_ratio(2 * tp, 2 * tp + fp + fn),
                "review_rate": (tp + fp) / validation_count,
                "rows": validation_count,
                "positives": validation_positive,
            }
        else:
            summary["validation_at_threshold"] = None

        # Deterministic top-k metrics: transaction_id breaks score ties, but
        # these are intentionally distinguished from fixed-score thresholds.
        rank_window = Window.orderBy(F.col("score").desc(), F.col("transaction_id").asc())
        ranked = selected_predictions.withColumn("rank", F.row_number().over(rank_window))
        topk = {}
        for fraction in (0.05, 0.10, 0.20):
            k = math.ceil(validation_count * fraction)
            row = ranked.where(F.col("rank") <= k).agg(
                F.count(F.lit(1)).alias("reviewed"), F.sum("label").alias("tp")
            ).first()
            tp_k = int(row["tp"] or 0)
            topk[str(int(fraction * 100)) + "pct"] = {
                "reviewed": int(row["reviewed"]), "capacity": k, "tp": tp_k,
                "recall": _metric_ratio(tp_k, validation_positive),
                "precision": _metric_ratio(tp_k, int(row["reviewed"])),
            }
        summary["validation_recall_at_top_k"] = topk

        subgroup = []
        if threshold is not None:
            by_group = selected_predictions.withColumn("reviewed", F.col("score") >= F.lit(threshold))
            for column in ("transaction_country", "channel"):
                rows = by_group.groupBy(column).agg(
                    F.count(F.lit(1)).alias("rows"), F.sum("label").alias("fraud"),
                    F.sum(F.when(F.col("reviewed") & (F.col("label") == 1), 1).otherwise(0)).alias("tp"),
                    F.sum(F.when(F.col("reviewed") & (F.col("label") == 0), 1).otherwise(0)).alias("fp"),
                ).orderBy(column).collect()
                for row in rows:
                    positives = int(row["fraud"] or 0)
                    tp = int(row["tp"] or 0)
                    fp = int(row["fp"] or 0)
                    subgroup.append({
                        "dimension": column, "value": row[column],
                        "rows": int(row["rows"]), "fraud": positives,
                        "precision": _metric_ratio(tp, tp + fp),
                        "recall": _metric_ratio(tp, positives),
                    })
        summary["validation_subgroups_at_threshold"] = subgroup
        summary["promotion_decision"] = (
            "candidate_for_final_test" if maximum_ap - baseline_ap > 0.001
            and (summary.get("validation_at_threshold") or {}).get("tp", 0) > 0
            else "no_candidate_beats_baseline_or_finds_positives_within_budget"
        )
        summary["total_runtime_seconds"] = time.monotonic() - started
        summary["mlflow_experiment_path"] = EXPERIMENT_PATH
        summary["mlflow_parent_run_id"] = parent.info.run_id

        # Bounded JSON evidence only; no transaction-level identifiers.
        safe_summary = _sanitize(summary)
        import tempfile
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", encoding="utf-8", delete=False) as artifact:
            json.dump(safe_summary, artifact, indent=2, allow_nan=False)
            artifact_path = artifact.name
        mlflow.log_artifact(artifact_path, artifact_path="reports")
        mlflow.log_metrics({
            "selected_validation_area_under_pr": float(selected["record"]["validation_area_under_pr"]),
            "selected_validation_auc_roc": selected_auc,
            "area_under_pr_lift_over_b0": float(maximum_ap - baseline_ap),
            "total_runtime_seconds": float(summary["total_runtime_seconds"]),
        })
    return _sanitize(summary)


def _sanitize(value: Any) -> Any:
    """Convert Spark/NumPy-like scalars and non-finite values to safe JSON."""
    if isinstance(value, dict):
        return {str(k): _sanitize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_sanitize(v) for v in value]
    if hasattr(value, "asDict"):
        return _sanitize(value.asDict())
    if hasattr(value, "item"):
        return _sanitize(value.item())
    if value is None or isinstance(value, (str, int, bool)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    return str(value)
