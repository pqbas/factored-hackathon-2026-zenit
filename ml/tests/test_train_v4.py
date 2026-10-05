from ml import train_v4


def test_v4_uses_causal_customer_behavior_features():
    expected = {
        "customer_merchant_count_30d", "customer_new_merchant_30d",
        "customer_prior_geo_count_30d", "customer_new_geo_30d",
        "geo_distance_km_from_mean_30d_log",
    }
    assert expected.issubset(train_v4.NUMERIC_FEATURES)
    assert train_v4.FEATURE_VERSION == "v4_customer_novelty_location"


def test_v4_never_exposes_raw_merchant_or_coordinates_as_predictors():
    forbidden = {
        "merchant_name", "latitude", "longitude", "is_fraud", "fraud_score",
        "transaction_status", "response_code", "process_date", "transaction_id",
        "customer_id",
    }
    assert forbidden.isdisjoint(train_v4.PREDICTORS)
    assert {"merchant_name", "latitude", "longitude"}.issubset(train_v4.RAW_SOURCE_FEATURES)


def test_v4_uses_fixed_pretest_temporal_cutoff():
    assert train_v4.TRAIN_END == "2025-07-01"
    assert train_v4.VALIDATION_END == "2026-01-01"
