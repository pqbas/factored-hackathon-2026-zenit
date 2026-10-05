from ml import train_v3


def test_v3_adds_only_predecision_transaction_context():
    assert train_v3.FEATURE_VERSION == "v3_transaction_context"
    assert "transaction_category" in train_v3.CATEGORICAL_FEATURES
    assert {"latitude_coarse", "longitude_coarse", "geo_present"}.issubset(
        train_v3.NUMERIC_FEATURES
    )
    assert "latitude" in train_v3.RAW_SOURCE_FEATURES
    assert "longitude" in train_v3.RAW_SOURCE_FEATURES


def test_v3_never_uses_labels_or_postdecision_fields_as_predictors():
    forbidden = {
        "is_fraud", "fraud_score", "transaction_status", "response_code",
        "process_date", "transaction_id", "customer_id", "latitude", "longitude",
    }
    assert forbidden.isdisjoint(train_v3.PREDICTORS)
    assert set(train_v3.PREDICTORS) == set(train_v3.NUMERIC_FEATURES + train_v3.CATEGORICAL_FEATURES)


def test_v3_keeps_original_temporal_validation_boundary_and_seals_test():
    assert train_v3.TRAIN_END == "2025-07-01"
    assert train_v3.VALIDATION_END == "2026-01-01"
