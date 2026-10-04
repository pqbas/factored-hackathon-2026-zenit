import numpy as np
import pandas as pd
import pytest

from ml import train_v4, train_v5 as v5


def test_development_period_boundaries_exclude_final_test():
    assert v5.period_for("2024-12-31T23:59:59") == "fit"
    assert v5.period_for("2025-01-01T00:00:00") == "selection"
    assert v5.period_for("2025-04-01T00:00:00") == "operating_point"
    assert v5.period_for("2025-07-01T00:00:00") == "exploratory_validation"
    with pytest.raises(ValueError, match="sealed"):
        v5.period_for("2026-01-01T00:00:00")


def test_equal_score_ties_cannot_be_split_to_hit_review_budget():
    result = v5.operating_points([1, 0, 0, 0], [0.5] * 4)
    assert all(item["point"] is None for item in result["budgets"])
    assert not any(item["feasible"] for item in result["precision_targets"])


def test_high_precision_requires_support_and_recall():
    y = np.zeros(10000, dtype=int)
    y[:90] = 1
    y[200:410] = 1
    scores = np.zeros(10000)
    scores[:100] = 0.9
    out = v5.operating_points(y, scores)
    target = next(t for t in out["precision_targets"] if t["target_precision"] == 0.8)
    assert target["feasible"]
    assert target["point"]["alerts"] == 100
    assert target["point"]["precision"] == 0.9
    assert target["point"]["recall"] == 0.3


def test_one_correct_alert_does_not_make_supported_high_precision():
    y = np.zeros(10000, dtype=int); y[:5] = 1
    scores = np.zeros(10000); scores[0] = 1
    out = v5.operating_points(y, scores)
    assert not any(t["feasible"] for t in out["precision_targets"])


def test_frozen_threshold_is_evaluated_without_later_label_tuning():
    y = np.r_[np.ones(80), np.zeros(9920)]
    scores = np.r_[np.ones(100), np.zeros(9900)]
    target = v5.operating_points(y, scores)["precision_targets"][-1]
    later_labels = np.r_[np.ones(20), np.zeros(9980)]
    later = v5.prediction_metrics(later_labels, scores, target["point"]["threshold"])
    assert later["alerts"] == 100
    assert later["precision"] == 0.2
    assert later["fp"] == 80


def test_no_alert_precision_is_undefined():
    out = v5.prediction_metrics([1, 0, 0], [0.1, 0.1, 0.1], 0.2)
    assert out["precision"] is None
    assert out["recall"] == 0
    assert out["fn"] == 1


@pytest.mark.parametrize("labels,scores", [([1, 0], [0.5, float("nan")]), ([0.5, 0], [0.1, 0.2])])
def test_invalid_predictions_fail_closed(labels, scores):
    with pytest.raises(ValueError):
        v5.prediction_metrics(labels, scores)
    with pytest.raises(ValueError):
        v5.operating_points(labels, scores)


def test_fit_medians_and_missing_flags_are_reused_without_leakage():
    frame = pd.DataFrame({c: [np.nan, 99] for c in v5.NUMERIC_FEATURES})
    for c in v5.CATEGORICAL_FEATURES:
        frame[c] = [None, "new_category"]
    frame["fraud_score"] = [99, 99]
    frame["is_fraud"] = [1, 1]
    frame["transaction_id"] = ["a", "b"]
    result = v5.prepare_inputs(frame, {c: 7 for c in v5.NUMERIC_FEATURES}, True)
    assert result.loc[0, "amount"] == 7
    assert result.loc[0, "amount_missing"] == 1
    assert result.loc[1, "amount_missing"] == 0
    assert result.loc[0, "channel"] == "__missing__"
    assert {"fraud_score", "is_fraud", "transaction_id"}.isdisjoint(result.columns)


def test_challenger_reuses_exact_v4_base_predictors():
    assert v5.PREDICTORS == train_v4.PREDICTORS
    assert v5.NUMERIC_FEATURES == train_v4.NUMERIC_FEATURES
