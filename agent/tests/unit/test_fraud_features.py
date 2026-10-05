import math

import pytest

from src.ml.features import CATEGORICAL, FEATURES, NUMERIC, from_source, vector


def test_feature_values_currency_timezone_and_source_exclusions():
    features = from_source({
        "transaction_date":"2025-06-07T23:30:00-05:00", "amount":"12.50", "currency":" USD ",
        "amount_usd":None, "merchant_name":"shop", "customer_merchant_count_30d":0,
        "customer_same_currency_tx_count_30d":5, "customer_same_currency_mean_abs_amount_30d":2.5,
        "fraud_score":100,"is_fraud":True,"customer_id":"other","transaction_status":"fraud",
    })
    assert features["hour"] == 4 and features["weekday"] == 6
    assert features["amount_usd_norm"] == 12.5
    assert features["customer_amount_ratio_30d"] == 5
    assert features["customer_new_merchant_30d"] == 1
    assert not {"is_fraud","fraud_score","customer_id","transaction_status"} & set(features)


def test_missing_flags_and_train_medians_have_explicit_fixed_order():
    medians = {name:3.0 for name in NUMERIC}
    result = vector({"amount":12,"currency":" COP ","channel":" ",
        "customer_same_currency_tx_count_30d":6},medians)
    assert len(result) == len(FEATURES)
    indexed = dict(zip(FEATURES,result))
    assert indexed["amount_missing"] == 0 and indexed["amount"] == 12
    assert indexed["seconds_since_prev_tx_missing"] == 1
    assert indexed["seconds_since_prev_tx"] == 3
    assert indexed["currency"] == "COP" and indexed["channel"] == "__missing__"
    assert indexed["has_prior_amount_support"] == 1


def test_sparse_amount_history_and_missing_merchant_do_not_create_fake_novelty():
    features = from_source({"transaction_date":"2025-01-01", "amount":9,"currency":"COP",
        "amount_usd":None,"merchant_name":None,"customer_merchant_count_30d":0,
        "customer_same_currency_tx_count_30d":4,"customer_same_currency_mean_abs_amount_30d":3})
    assert features["amount_usd_norm"] is None and features["customer_amount_ratio_30d"] is None
    assert features["customer_merchant_count_30d"] is None and features["customer_new_merchant_30d"] is None


def test_nonfinite_features_are_missing_and_bad_fitted_medians_fail():
    medians = {name:0.0 for name in NUMERIC}
    result = dict(zip(FEATURES,vector({"amount":float("inf")},medians)))
    assert result["amount_missing"] == 1 and result["amount"] == 0
    medians["amount"] = float("nan")
    with pytest.raises(ValueError):
        vector({},medians)
