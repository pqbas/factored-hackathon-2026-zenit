#!/usr/bin/env python3
"""Phase 1: reproducible V1 feature contract for the fraud model.

This module defines the predictor allowlist, leakage exclusions, derived
features, normalized USD amount, and temporal split boundaries. It contains
no training, no stateful preprocessing, and no remote calls.

Pure Python transforms operate on row mappings for tests and offline use;
SQL templates express the same logic for future read-only remote reads.

No fitted preprocessing (imputers, encoders, scalers, vocabularies, or
feature selection) is implemented in this phase; those are fitted on the
training split only and belong to Phase 2.
"""

from __future__ import annotations

import datetime as _dt
import math
from typing import Any, Mapping, Optional, Tuple

SOURCE_TABLE = "workspace.bank_silver.transactions"

# ──────────────────────────────────────────────────────────────
# Column roles
# ──────────────────────────────────────────────────────────────

# Provenance columns kept for joins and audit. Never predictors.
ID_COLUMNS: Tuple[str, ...] = ("transaction_id", "customer_id", "product_id")

# Temporal partitioning column.
DATE_COLUMN: str = "transaction_date"

# The label. Must never enter the predictor matrix X.
LABEL_COLUMN: str = "is_fraud"

# Raw source columns required to compute V1 predictors.
RAW_INPUT_COLUMNS: Tuple[str, ...] = (
    "amount",
    "currency",
    "amount_usd",
    "transaction_type",
    "channel",
    "transaction_country",
    "merchant_category",
    "transaction_date",
)

# Raw source columns that map directly into X (predictors).
RAW_PREDICTOR_COLUMNS: Tuple[str, ...] = (
    "amount",
    "currency",
    "transaction_type",
    "channel",
    "transaction_country",
    "merchant_category",
)

# Derived predictor names computed from raw inputs.
DERIVED_PREDICTOR_COLUMNS: Tuple[str, ...] = (
    "log_abs_amount",
    "amount_sign",
    "amount_usd_norm",
    "hour",
    "weekday",
    "is_weekend",
)

# Complete V1 predictor allowlist: the only features that may enter X.
PREDICTOR_COLUMNS: Tuple[str, ...] = RAW_PREDICTOR_COLUMNS + DERIVED_PREDICTOR_COLUMNS

# Columns explicitly excluded from X. Reasons: label, leakage, or post-event
# outcomes. Kept for documentation; the allowlist above is authoritative.
EXCLUDED_COLUMNS: frozenset[str] = frozenset(
    {
        "is_fraud",               # label
        "fraud_score",            # suspected leakage (Phase 0: >=70 is 100% fraud)
        "transaction_status",     # may reflect fraud detection outcome
        "response_code",          # may reflect fraud detection outcome
        "process_date",           # ingestion metadata, not available at T
        "transaction_category",   # not in V1
        "merchant_name",          # free text / identifier
        "transaction_city",       # not in V1
        "latitude",               # GPS quality unverified
        "longitude",              # GPS quality unverified
        "amount_usd",             # raw; replaced by derived amount_usd_norm
    }
)

# Sentinel for missing/unknown categorical values. Applied deterministically
# (not fitted). Encoding into numeric form happens at training time only.
CATEGORICAL_MISSING = "__missing__"

# ──────────────────────────────────────────────────────────────
# Temporal split boundaries (inclusive start, exclusive end)
# ──────────────────────────────────────────────────────────────

SPLIT_TRAIN_END = _dt.datetime(2025, 7, 1)
SPLIT_VALIDATION_END = _dt.datetime(2026, 1, 1)

SPLIT_LABELS: Tuple[str, ...] = ("train", "validation", "test")


# ──────────────────────────────────────────────────────────────
# Pure transforms
# ──────────────────────────────────────────────────────────────


def _as_datetime(value: Any) -> Optional[_dt.datetime]:
    """Coerce a datetime, date, or ISO string to a naive datetime."""
    if value is None:
        return None
    if isinstance(value, _dt.datetime):
        return value
    if isinstance(value, _dt.date):
        return _dt.datetime(value.year, value.month, value.day)
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        if s.endswith("Z") or s.endswith("z"):
            s = s[:-1]
        return _dt.datetime.fromisoformat(s)
    raise TypeError(f"Cannot interpret transaction_date value of type {type(value)!r}")


def temporal_split(transaction_date: Any) -> Optional[str]:
    """Return the temporal partition for a transaction date.

    Boundaries (documented, subject to timezone assumptions):
      train:      transaction_date <  2025-07-01
      validation: 2025-07-01 <= transaction_date <  2026-01-01
      test:       transaction_date >= 2026-01-01

    Missing/unparseable dates return None and must be handled explicitly.
    """
    dt = _as_datetime(transaction_date)
    if dt is None:
        return None
    if dt < SPLIT_TRAIN_END:
        return "train"
    if dt < SPLIT_VALIDATION_END:
        return "validation"
    return "test"


def normalize_usd_amount(amount: Any, currency: Any, amount_usd: Any) -> Any:
    """Normalized USD amount (denominator common to all currencies).

    USD-native rows use their own amount (no conversion needed); non-USD rows
    use the supplied amount_usd conversion. Returns None when the required
    input is missing (e.g. non-USD rows without a conversion). Never falls
    back to mixing raw local-currency amounts into a USD feature.
    """
    if amount is None:
        return None
    if currency == "USD":
        return amount
    # non-USD: rely on the supplied conversion; None remains missing
    return amount_usd


def log_abs_amount(amount: Any) -> Optional[float]:
    """log1p(abs(amount)); skew reduction that keeps zero at zero."""
    if amount is None:
        return None
    return math.log1p(abs(float(amount)))


def amount_sign(amount: Any) -> Optional[int]:
    """Sign of amount: 1 positive, -1 negative, 0 zero; None if missing."""
    if amount is None:
        return None
    if amount > 0:
        return 1
    if amount < 0:
        return -1
    return 0


def time_features(transaction_date: Any) -> Tuple[Optional[int], Optional[int], Optional[int]]:
    """Return (hour, weekday, is_weekend) from a transaction date.

    weekday follows the Python convention: 0=Monday ... 6=Sunday.
    is_weekend is 1 for Saturday/Sunday, else 0.
    """
    dt = _as_datetime(transaction_date)
    if dt is None:
        return (None, None, None)
    weekday = dt.weekday()
    return (dt.hour, weekday, 1 if weekday >= 5 else 0)


def represent_categorical(value: Any) -> str:
    """Deterministic missing-category representation (no vocabulary fitting)."""
    if value is None:
        return CATEGORICAL_MISSING
    s = str(value).strip()
    if s == "":
        return CATEGORICAL_MISSING
    return s


def build_v1_features(row: Mapping[str, Any]) -> dict[str, Any]:
    """Compute the full V1 predictor set from a single raw transaction row.

    Returns a dict keyed by PREDICTOR_COLUMNS. IDs, label, and transaction_date
    are intentionally not included (they are separated upstream).
    """
    amount = row.get("amount")
    currency = row.get("currency")
    amount_usd = row.get("amount_usd")
    tx_date = row.get(DATE_COLUMN)

    hour, weekday, is_weekend = time_features(tx_date)

    return {
        "amount": amount,
        "currency": represent_categorical(currency),
        "transaction_type": represent_categorical(row.get("transaction_type")),
        "channel": represent_categorical(row.get("channel")),
        "transaction_country": represent_categorical(row.get("transaction_country")),
        "merchant_category": represent_categorical(row.get("merchant_category")),
        "log_abs_amount": log_abs_amount(amount),
        "amount_sign": amount_sign(amount),
        "amount_usd_norm": normalize_usd_amount(amount, currency, amount_usd),
        "hour": hour,
        "weekday": weekday,
        "is_weekend": is_weekend,
    }


# ──────────────────────────────────────────────────────────────
# SQL templates (read-only expressions; not materialized here)
# ──────────────────────────────────────────────────────────────

USD_AMOUNT_NORM_SQL = "CASE WHEN currency = 'USD' THEN amount ELSE amount_usd END"
LOG_ABS_AMOUNT_SQL = "LN(1 + ABS(amount))"
AMOUNT_SIGN_SQL = (
    "CASE WHEN amount > 0 THEN 1 WHEN amount < 0 THEN -1 ELSE 0 END"
)
HOUR_SQL = "HOUR(transaction_date)"
# Databricks DAYOFWEEK: 1=Sunday..7=Saturday; shift to 0=Monday..6=Sunday.
WEEKDAY_SQL = "MOD(DAYOFWEEK(transaction_date) + 5, 7)"
IS_WEEKEND_SQL = (
    "CASE WHEN MOD(DAYOFWEEK(transaction_date) + 5, 7) >= 5 THEN 1 ELSE 0 END"
)


def v1_feature_select_sql(
    source_table: str = SOURCE_TABLE, version: Optional[int] = None
) -> str:
    """Build a read-only SELECT that materializes the V1 feature row.

    Includes provenance (IDs), transaction_date, the label, and the predictor
    set. This is a contract expression; it is NOT executed or materialized in
    this phase.
    """
    src = source_table if version is None else f"{source_table} VERSION AS OF {version}"
    columns = [
        "transaction_id",
        "customer_id",
        "product_id",
        "transaction_date",
        "is_fraud",
        "amount",
        "currency",
        f"{LOG_ABS_AMOUNT_SQL} AS log_abs_amount",
        f"{AMOUNT_SIGN_SQL} AS amount_sign",
        f"{USD_AMOUNT_NORM_SQL} AS amount_usd_norm",
        "transaction_type",
        "channel",
        "transaction_country",
        "merchant_category",
        f"{HOUR_SQL} AS hour",
        f"{WEEKDAY_SQL} AS weekday",
        f"{IS_WEEKEND_SQL} AS is_weekend",
    ]
    select = ",\n  ".join(columns)
    return f"SELECT\n  {select}\nFROM {src}"
