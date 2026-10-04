from datetime import datetime, timedelta
import math

import numpy as np
import pytest

from ml import train_v6 as v6


def test_extra_history_excludes_same_time_future_and_other_currency():
    t = datetime(2025, 1, 1, 12)
    current = dict(transaction_date=t, customer_id="c", product_id="p", amount=80, currency="USD", transaction_country="MX")
    prior = [dict(current, transaction_date=t-timedelta(minutes=5-i), amount=(i+1)*10, transaction_country="CO") for i in range(5)]
    prior += [dict(current, amount=999), dict(current, transaction_date=t+timedelta(seconds=1), amount=999)]
    prior += [dict(current, transaction_date=t-timedelta(minutes=2), currency="COP", amount=999)]
    result = v6.causal_extra_features(current, prior)
    assert result["product_tx_count_5m"] == 6
    assert result["product_same_currency_abs_amount_sum_1h"] == 150
    assert result["customer_amount_zscore_30d"] == pytest.approx(50/math.sqrt(250))
    assert result["customer_country_tx_count_30d"] == 1
    assert result["customer_new_country_30d"] == 0


def test_inadequate_or_constant_amount_history_has_no_zscore():
    t = datetime(2025, 1, 1)
    current = dict(transaction_date=t, customer_id="c", product_id="p", amount=10, currency="USD", transaction_country="MX")
    assert v6.causal_extra_features(current, [])['customer_amount_zscore_30d'] is None
    prior = [dict(current, transaction_date=t-timedelta(hours=i+1)) for i in range(10)]
    assert v6.causal_extra_features(current, prior)['customer_amount_zscore_30d'] is None


def test_reference_ranks_preserve_ties_and_do_not_use_query_batch_distribution():
    reference = [0.1, 0.1, 0.5]
    assert v6.empirical_rank(reference, [0.1, 0.1, 0.7]).tolist() == [2/3, 2/3, 1]
    assert v6.empirical_rank(reference, [0.1])[0] == v6.empirical_rank(reference, [0.1, 0.9])[0]
    with pytest.raises(ValueError):
        v6.empirical_rank([], [0.5])


def test_permutation_control_preserves_label_weight_pairing():
    y = np.array([1]*20+[0]*80); w = np.where(y==1,1,10)
    py, pw = v6.permute_labels_and_weights(y,w)
    assert py.sum()==y.sum() and not np.array_equal(py,y)
    assert np.array_equal(pw,np.where(py==1,1,10))
    assert np.array_equal(py,v6.permute_labels_and_weights(y,w)[0])


def test_no_outcome_fields_are_new_predictors():
    assert {'fraud_score','is_fraud','transaction_status','response_code','process_date','product_id','customer_id'}.isdisjoint(v6.V6_EXTRA_NUMERIC)
