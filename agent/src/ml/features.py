"""Serving feature contract; identifiers and post-transaction fields are excluded."""
from __future__ import annotations

import math
from datetime import datetime, timezone

FEATURE_VERSION = "v7_gold_lakebase_causal"
NUMERIC = [
    "amount", "log_abs_amount", "amount_sign", "amount_usd_norm", "hour", "weekday", "is_weekend",
    "customer_tx_count_1h", "customer_tx_count_24h", "customer_tx_count_7d", "seconds_since_prev_tx",
    "customer_same_currency_tx_count_30d", "customer_same_currency_mean_abs_amount_30d",
    "customer_amount_ratio_30d", "customer_merchant_count_30d", "customer_new_merchant_30d",
]
CATEGORICAL = ["currency", "transaction_type", "channel", "transaction_country", "merchant_category", "transaction_category"]
FEATURES = [item for name in NUMERIC for item in (name + "_missing", name)] + CATEGORICAL + ["has_prior_amount_support"]


def number(value):
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError("Booleans are not numeric feature values")
    result = float(value)
    if not math.isfinite(result):
        return None
    return result


def timestamp(value):
    result = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if result.tzinfo is not None:
        result = result.astimezone(timezone.utc).replace(tzinfo=None)
    return result


def from_source(row: dict) -> dict:
    """Derive the same scalar features as the Spark builder, using SQL history aggregates."""
    date = timestamp(row["transaction_date"])
    amount = number(row.get("amount"))
    currency = str(row.get("currency") or "").strip()
    result = {name: row.get(name) for name in NUMERIC + CATEGORICAL}
    result.update({
        "amount": amount,
        "log_abs_amount": math.log1p(abs(amount)) if amount is not None else None,
        "amount_sign": 1.0 if amount is not None and amount > 0 else -1.0 if amount is not None and amount < 0 else 0.0,
        "amount_usd_norm": amount if currency.upper() == "USD" else number(row.get("amount_usd")),
        "hour": float(date.hour), "weekday": float(date.weekday()), "is_weekend": float(date.weekday() >= 5),
    })
    support = number(row.get("customer_same_currency_tx_count_30d"))
    mean = number(row.get("customer_same_currency_mean_abs_amount_30d"))
    result["customer_amount_ratio_30d"] = abs(amount) / mean if amount is not None and support is not None and support >= 5 and mean is not None and mean > 0 else None
    merchant_count = number(row.get("customer_merchant_count_30d"))
    if row.get("merchant_name") is None:
        result["customer_merchant_count_30d"] = None
        result["customer_new_merchant_30d"] = None
    else:
        result["customer_new_merchant_30d"] = float(merchant_count == 0) if merchant_count is not None else None
    return result


def vector(features: dict, medians: dict) -> list:
    """Use fitted training medians, missing flags and a fixed predictor order."""
    result = []
    for name in NUMERIC:
        value = number(features.get(name))
        median = number(medians[name])
        if median is None:
            raise ValueError("Invalid fitted median")
        result.extend([float(value is None), value if value is not None else median])
    for name in CATEGORICAL:
        value = features.get(name)
        result.append(str(value).strip() if value is not None and str(value).strip() else "__missing__")
    result.append(float((number(features.get("customer_same_currency_tx_count_30d")) or 0) >= 5))
    return result
