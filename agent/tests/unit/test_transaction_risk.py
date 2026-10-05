import asyncio
import json
from pathlib import Path
from unittest.mock import patch

import pytest

from lakebase_fakes import FakePool
from src.ml.predictor import DEFAULT_MODEL_DIR, Predictor
from src.tools.transaction_risk import FEATURE_SQL, transaction_risk, transaction_risk_tool

ROW = {"transaction_id": "TX-UNIT", "transaction_date": "2025-06-01T12:00:00Z",
       "amount": 100, "currency": "USD", "merchant_name": "Fixture"}


def test_native_artifact_generates_nonconstant_scores_and_keeps_policy():
    model = Predictor(DEFAULT_MODEL_DIR)
    a = model.predict(ROW)
    b = model.predict({**ROW, "amount": 1000000, "channel": "ATM", "currency": "COP"})
    assert 0 <= a["risk_score"] <= 1
    assert a["risk_score"] != b["risk_score"]
    assert a["fraud_prediction"] == (a["risk_score"] >= a["threshold"])
    assert a["review_required"] is True and a["automatic_decisions_enabled"] is False
    assert a["score_type"] == "uncalibrated_model_output"


def test_invalid_artifact_hash_is_rejected(tmp_path):
    manifest = json.loads((DEFAULT_MODEL_DIR / "manifest.json").read_text())
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    (tmp_path / "model.cbm").write_bytes(b"not a model")
    with pytest.raises(ValueError, match="integrity"):
        Predictor(tmp_path)


def test_authentication_and_missing_or_ambiguous_owned_rows_fail_without_scores():
    for customer, rows in [(None, [ROW]), ("OWNER", []), ("OWNER", [ROW, ROW])]:
        pool = FakePool(transactions=rows)
        result = asyncio.run(transaction_risk(customer, "TX-UNIT", pool))
        assert result["risk_score"] is None and result["fraud_prediction"] is None
        assert result["review_required"] is True
        if customer is None:
            assert not pool.queries


def test_llm_cannot_override_customer_or_supply_a_score():
    pool = FakePool(transactions=[ROW])
    tool = transaction_risk_tool("TRUSTED-OWNER", pool)
    result = json.loads(asyncio.run(tool.ainvoke({"transaction_id": "TX-UNIT",
        "customer_id": "OTHER", "risk_score": 1})))
    assert pool.queries[0][1] == {"customer_id": "TRUSTED-OWNER", "transaction_id": "TX-UNIT"}
    assert result["risk_score"] != 1
    assert result["score_status"] == "experimental_prediction"


def test_feature_query_restricts_history_and_excludes_leakage():
    assert "h.transaction_date < t.transaction_date" in FEATURE_SQL
    assert "h.customer_id = %(customer_id)s" in FEATURE_SQL
    assert "t.customer_id = %(customer_id)s AND t.transaction_id = %(transaction_id)s" in FEATURE_SQL
    assert "p.product_status = 'Active'" in FEATURE_SQL
    for field in ["is_fraud", "fraud_score", "response_code", "process_date", "transaction_status"]:
        assert field not in FEATURE_SQL
    for window in ["1 hour", "24 hours", "7 days", "30 days"]:
        assert "interval '" + window + "'" in FEATURE_SQL


def test_lookup_error_or_missing_model_never_fabricates_predictions():
    with patch("src.tools.transaction_risk.get_predictor", side_effect=FileNotFoundError):
        result = asyncio.run(transaction_risk("OWNER", "TX-UNIT", FakePool(transactions=[ROW])))
    assert result["risk_score"] is None
    result = asyncio.run(transaction_risk("OWNER", "TX-UNIT", FakePool(error=TimeoutError())))
    assert result["fraud_prediction"] is None
    assert result["automatic_decisions_enabled"] is False
