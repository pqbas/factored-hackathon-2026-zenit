"""Load the hashed native model once and produce experimental predictions."""
from __future__ import annotations

import hashlib
import json
import math
import os
from functools import lru_cache
from pathlib import Path

from src.ml.features import CATEGORICAL, FEATURES, FEATURE_VERSION, NUMERIC, from_source, vector

DEFAULT_MODEL_DIR = Path(__file__).resolve().parents[2] / "configs" / "fraud-model"


class Predictor:
    def __init__(self, directory):
        from catboost import CatBoostClassifier

        directory = Path(directory)
        self.manifest = json.loads((directory / "manifest.json").read_text())
        metadata = self.manifest
        if metadata["feature_version"] != FEATURE_VERSION or metadata["feature_names"] != FEATURES:
            raise ValueError("Model and serving feature contract differ")
        if metadata["numeric_features"] != NUMERIC or metadata["categorical_features"] != CATEGORICAL:
            raise ValueError("Model predictor allowlist differs")
        threshold = metadata["threshold"]
        if isinstance(threshold, bool) or not isinstance(threshold,(float,int)) or not math.isfinite(threshold) or not 0 < threshold < 1:
            raise ValueError("Invalid frozen threshold")
        vector({}, metadata["medians"])
        model_path = directory / "model.cbm"
        if hashlib.sha256(model_path.read_bytes()).hexdigest() != metadata["model_sha256"]:
            raise ValueError("Model integrity check failed")
        self.model = CatBoostClassifier()
        self.model.load_model(str(model_path))
        if self.model.feature_names_ != FEATURES:
            raise ValueError("Native model feature order differs")

    def predict(self, row: dict) -> dict:
        from catboost import Pool

        metadata = self.manifest
        values = vector(from_source(row), metadata["medians"])
        data = Pool([values], feature_names=FEATURES, cat_features=CATEGORICAL)
        score = float(self.model.predict_proba(data,thread_count=1)[0,1])
        if not math.isfinite(score) or not 0 <= score <= 1:
            raise ValueError("Invalid native model output")
        return {
            "schema_version":"1.1", "scope":"transaction_inference",
            "score_status":"experimental_prediction", "risk_score":score,
            "fraud_prediction":bool(score >= metadata["threshold"]),
            "score_type":"uncalibrated_model_output", "threshold":metadata["threshold"],
            "model_version":metadata["model_version"], "model_run_id":metadata["run_id"],
            "feature_version":FEATURE_VERSION,
            "transaction_id":row["transaction_id"],
            "automatic_decisions_enabled":False, "review_required":True,
            "reason_codes":["MODEL_UTILITY_NOT_VALIDATED","HUMAN_REVIEW_REQUIRED"],
            "validation_precision":metadata["validation_metrics"]["precision"],
            "validation_recall":metadata["validation_metrics"]["recall"],
        }


@lru_cache(maxsize=2)
def _load(directory: str, model_modified: int, manifest_modified: int):
    return Predictor(directory)


def get_predictor():
    directory = Path(os.getenv("FRAUD_MODEL_DIR",str(DEFAULT_MODEL_DIR)))
    return _load(str(directory), (directory/"model.cbm").stat().st_mtime_ns,
        (directory/"manifest.json").stat().st_mtime_ns)
