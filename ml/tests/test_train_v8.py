from datetime import datetime, timedelta

import pytest

from ml import train_v8 as v8


def event(t, **kwargs):
    return dict(event_id="e", event_date=t, process_date=(t-timedelta(days=1)).date(),
                customer_id="c", event_type="Login", event_category="Authentication",
                platform="Android", browser=None, channel="Android App", ip_country="MX",
                is_mobile=True, duration_seconds=20, **kwargs)


def test_availability_waits_until_processing_day_is_complete():
    t = datetime(2025, 1, 2, 12)
    row = event(t)
    row["process_date"] = t.date()
    assert v8.availability_time(row) == datetime(2025, 1, 3)
    row["process_date"] = None
    assert v8.availability_time(row) is None


def test_digital_history_excludes_same_time_future_and_other_customers():
    t = datetime(2025, 1, 10, 12)
    current = dict(customer_id="c", transaction_date=t, transaction_country="MX")
    rows = [event(t-timedelta(hours=1)), event(t-timedelta(days=7)), event(t), event(t+timedelta(seconds=1))]
    other = event(t-timedelta(minutes=1))
    other["customer_id"] = "other"
    rows.append(other)
    result = v8.digital_reference(current,rows)
    assert result["digital_count_1h"] == 1
    assert result["digital_count_7d"] == 2
    assert result["digital_seconds_since_latest"] == 3600
    assert result["digital_latest_country_mismatch"] == 0


def test_same_day_event_is_not_assumed_delivered_immediately():
    t = datetime(2025, 1, 10, 12)
    row = event(t-timedelta(minutes=1))
    row["process_date"] = t.date()
    result = v8.digital_reference(dict(customer_id="c", transaction_date=t),[row])
    assert result["digital_available"] == 0
    assert result["digital_count_7d"] == 0
    assert result["digital_seconds_since_latest"] is None


def test_missing_customer_does_not_share_null_event_history():
    t = datetime(2025, 1, 10, 12)
    row = event(t-timedelta(hours=1))
    row["customer_id"] = None
    result = v8.digital_reference(dict(customer_id=None, transaction_date=t),[row])
    assert result["digital_available"] == 0


def test_latest_ties_are_deterministic_and_never_use_future_country():
    t = datetime(2025, 1, 10, 12)
    a = event(t-timedelta(hours=1)); a["event_id"] = "a"
    b = event(t-timedelta(hours=1)); b.update(event_id="b",ip_country="CO")
    result = v8.digital_reference(dict(customer_id="c", transaction_date=t, transaction_country="MX"),[a,b])
    assert result["digital_latest_country_mismatch"] == 1
    assert result == v8.digital_reference(dict(customer_id="c", transaction_date=t, transaction_country="MX"),[b,a])


def test_sensitive_keys_and_outcomes_are_not_predictors():
    prohibited = {"is_fraud","fraud_score","process_date","transaction_status","response_code","customer_id","product_id","event_id","session_id","ip_address"}
    assert prohibited.isdisjoint(v8.DIGITAL_NUMERIC+v8.DIGITAL_CATEGORICAL)


def test_relative_gain_without_useful_precision_does_not_clear_gate():
    baseline = dict(average_precision=0.001,precision=0.0008)
    candidate = dict(average_precision=0.004,prevalence=0.001,precision=0.002,recall=0.2,alerts=1000,roc_auc=0.7)
    assert not v8.clears_exploratory_gate(candidate,baseline)
    candidate["precision"] = 0.02
    assert v8.clears_exploratory_gate(candidate,baseline)


def test_empty_alerts_do_not_clear_gate():
    candidate = dict(average_precision=0.1,prevalence=0.001,precision=None,recall=0,alerts=0,roc_auc=0.9)
    assert not v8.clears_exploratory_gate(candidate,dict(average_precision=0.001,precision=0.001))


def test_long_history_includes_exact_boundaries_but_preserves_short_counts():
    t = datetime(2025, 4, 10, 12)
    current = dict(customer_id="c", transaction_date=t, transaction_country="MX")
    rows = [event(t-timedelta(days=days)) for days in [7,30,90,91]]
    result = v8.digital_reference(current,rows,lookback_days=90)
    assert result["digital_count_7d"] == 1
    assert result["digital_count_30d"] == 2
    assert result["digital_count_90d"] == 3
    assert result["digital_login_count_90d"] == 3
    assert result["digital_available"] == 1
