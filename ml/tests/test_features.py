"""Unit tests for ml/features.py (Phase 1 V1 feature contract).

Covers: USD amount derivation, missing categories, zero/negative/missing
amounts, temporal split boundaries, predictor allowlist/leakage exclusions,
ID/label/predictor separation, and dry-run performing no remote calls.

No test connects to Databricks or reads customer records.
"""

from __future__ import annotations

import datetime as dt
import json
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import features  # noqa: E402


# ── temporal split ──────────────────────────────────────────


def test_split_train_boundary():
    assert features.temporal_split(dt.datetime(2025, 6, 30, 23, 59, 59)) == "train"
    assert features.temporal_split(dt.datetime(2024, 1, 1)) == "train"


def test_split_validation_boundary():
    assert features.temporal_split(dt.datetime(2025, 7, 1)) == "validation"
    assert features.temporal_split(dt.datetime(2025, 12, 31, 23, 59, 59)) == "validation"


def test_split_test_boundary():
    assert features.temporal_split(dt.datetime(2026, 1, 1)) == "test"
    assert features.temporal_split(dt.datetime(2026, 6, 18)) == "test"


def test_split_missing_date():
    assert features.temporal_split(None) is None
    assert features.temporal_split("") is None


def test_split_iso_string():
    assert features.temporal_split("2025-07-01T00:00:00") == "validation"
    assert features.temporal_split("2026-01-01T00:00:00Z") == "test"


# ── USD amount derivation ────────────────────────────────────


def test_normalize_usd_amount_usd_row_uses_amount():
    assert features.normalize_usd_amount(100.0, "USD", None) == 100.0


def test_normalize_usd_amount_non_usd_uses_conversion():
    assert features.normalize_usd_amount(4000.0, "COP", 1.0) == 1.0


def test_normalize_usd_amount_non_usd_missing_conversion_is_none():
    assert features.normalize_usd_amount(4000.0, "COP", None) is None


def test_normalize_usd_amount_missing_amount_is_none():
    assert features.normalize_usd_amount(None, "USD", None) is None


# ── amount transforms ────────────────────────────────────────


def test_log_abs_amount():
    assert features.log_abs_amount(0) == 0.0
    assert features.log_abs_amount(100) == pytest.approx(4.6151, rel=1e-3)
    assert features.log_abs_amount(-100) == pytest.approx(4.6151, rel=1e-3)


def test_log_abs_amount_missing():
    assert features.log_abs_amount(None) is None


def test_amount_sign():
    assert features.amount_sign(5) == 1
    assert features.amount_sign(-5) == -1
    assert features.amount_sign(0) == 0
    assert features.amount_sign(None) is None


# ── categorical missing handling ─────────────────────────────


def test_represent_categorical_none():
    assert features.represent_categorical(None) == features.CATEGORICAL_MISSING


def test_represent_categorical_empty_string():
    assert features.represent_categorical("   ") == features.CATEGORICAL_MISSING


def test_represent_categorical_value():
    assert features.represent_categorical("POS") == "POS"
    assert features.represent_categorical("  App ") == "App"


def test_build_v1_features_merchant_missing():
    row = {
        "amount": 10.0,
        "currency": "USD",
        "amount_usd": None,
        "transaction_type": "Purchase",
        "channel": "App",
        "transaction_country": "México",
        "merchant_category": None,
        "transaction_date": dt.datetime(2025, 3, 1, 14, 30, 0),
    }
    out = features.build_v1_features(row)
    assert out["merchant_category"] == features.CATEGORICAL_MISSING


# ── allowlist and separation ─────────────────────────────────


def test_predictor_allowlist_excludes_label_and_leakage():
    banned = {"is_fraud", "fraud_score", "transaction_status", "response_code", "process_date"}
    allow = set(features.PREDICTOR_COLUMNS)
    assert allow.isdisjoint(banned)


def test_predictor_allowlist_excludes_ids():
    allow = set(features.PREDICTOR_COLUMNS)
    assert allow.isdisjoint(set(features.ID_COLUMNS))
    assert features.DATE_COLUMN not in allow


def test_build_v1_features_separates_label_and_ids():
    row = {
        "transaction_id": "tx-1",
        "customer_id": "c-1",
        "product_id": "p-1",
        "amount": 10.0,
        "currency": "USD",
        "amount_usd": None,
        "transaction_type": "Purchase",
        "channel": "App",
        "transaction_country": "México",
        "merchant_category": "Food",
        "transaction_date": dt.datetime(2025, 3, 1, 14, 30, 0),
        "is_fraud": True,
        "fraud_score": 99.0,
    }
    out = features.build_v1_features(row)
    # labels and IDs must not leak into the feature dict
    assert "is_fraud" not in out
    assert "transaction_id" not in out
    assert "customer_id" not in out
    assert "product_id" not in out
    assert "fraud_score" not in out
    # every key is an allowed predictor
    assert set(out.keys()) == set(features.PREDICTOR_COLUMNS)


# ── time features ────────────────────────────────────────────


def test_time_features():
    d = dt.datetime(2025, 3, 1, 14, 30, 0)  # Saturday
    hour, weekday, is_weekend = features.time_features(d)
    assert hour == 14
    assert weekday == 5  # Saturday
    assert is_weekend == 1


def test_time_features_missing():
    assert features.time_features(None) == (None, None, None)


# ── SQL contract ─────────────────────────────────────────────


def test_v1_feature_select_sql_pins_version():
    sql = features.v1_feature_select_sql(version=1)
    assert "VERSION AS OF 1" in sql
    assert "workspace.bank_silver.transactions" in sql


def test_v1_feature_select_sql_contains_predictors():
    sql = features.v1_feature_select_sql(version=1)
    for col in ("amount_usd_norm", "log_abs_amount", "amount_sign", "hour", "weekday", "is_weekend"):
        assert col in sql


# ── dry-run makes no remote calls ────────────────────────────


def test_validate_features_dry_run_no_remote(monkeypatch):
    from validate_features import _validation_queries

    # ensure dry-run path never touches the CLI by monkeypatching subprocess
    def boom(*args, **kwargs):
        raise AssertionError("dry-run must not invoke subprocess")

    monkeypatch.setattr(subprocess, "run", boom)
    queries = _validation_queries("workspace.bank_silver.transactions", version=1)
    assert len(queries) == 6
    for q in queries:
        assert q["sql"].strip()
        assert "VERSION AS OF 1" in q["sql"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
