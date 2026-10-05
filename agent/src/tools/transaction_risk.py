"""Real inference from existing, customer-scoped Lakebase SELECT queries only."""
from __future__ import annotations

import asyncio
import json
import logging
import re

from langchain_core.tools import StructuredTool

from src.config import settings
from src.ml.predictor import get_predictor

logger = logging.getLogger(__name__)
_SCHEMA = re.compile(r"^[a-z_][a-z0-9_]*$")

FEATURE_SQL = """
WITH target AS (
  SELECT t.transaction_id, t.transaction_date, t.amount, t.currency, t.amount_usd,
    t.transaction_type, t.channel, t.transaction_country, t.merchant_category,
    t.transaction_category, t.merchant_name
  FROM {schema}.customer_transactions t
  JOIN {schema}.customer_products p
    ON t.product_id = p.product_id AND t.customer_id = p.customer_id
  WHERE t.customer_id = %(customer_id)s AND t.transaction_id = %(transaction_id)s
    AND p.product_status = 'Active' AND p.product_type IN ('Tarjeta Crédito', 'Cuenta Ahorro')
)
SELECT t.*, history.*
FROM target t
CROSS JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE h.transaction_date >= t.transaction_date - interval '1 hour')::double precision AS customer_tx_count_1h,
    count(*) FILTER (WHERE h.transaction_date >= t.transaction_date - interval '24 hours')::double precision AS customer_tx_count_24h,
    count(*) FILTER (WHERE h.transaction_date >= t.transaction_date - interval '7 days')::double precision AS customer_tx_count_7d,
    extract(epoch FROM (t.transaction_date - max(h.transaction_date)))::double precision AS seconds_since_prev_tx,
    count(*) FILTER (WHERE h.transaction_date >= t.transaction_date - interval '30 days'
      AND h.currency IS NOT DISTINCT FROM t.currency)::double precision AS customer_same_currency_tx_count_30d,
    avg(abs(h.amount::double precision)) FILTER (WHERE h.transaction_date >= t.transaction_date - interval '30 days'
      AND h.currency IS NOT DISTINCT FROM t.currency) AS customer_same_currency_mean_abs_amount_30d,
    CASE WHEN t.merchant_name IS NULL THEN NULL ELSE count(*) FILTER (
      WHERE h.transaction_date >= t.transaction_date - interval '30 days' AND h.merchant_name = t.merchant_name
    )::double precision END AS customer_merchant_count_30d
  FROM {schema}.customer_transactions h
  WHERE h.customer_id = %(customer_id)s AND h.transaction_date < t.transaction_date
) history
LIMIT 2
"""


def unavailable(reason: str) -> dict:
    return {"schema_version":"1.1","scope":"transaction_inference","score_status":"unavailable",
        "risk_score":None,"fraud_prediction":None,"automatic_decisions_enabled":False,
        "review_required":True,"reason_codes":[reason,"HUMAN_REVIEW_REQUIRED"]}


async def transaction_risk(customer_id: str | None, transaction_id: str, pool=None) -> dict:
    if not customer_id:
        return unavailable("AUTHENTICATED_CUSTOMER_REQUIRED")
    if not isinstance(transaction_id,str) or not transaction_id.strip() or len(transaction_id) > 128:
        return unavailable("INVALID_TRANSACTION_REFERENCE")
    if not _SCHEMA.fullmatch(settings.bank_ro_schema):
        return unavailable("INVALID_BANK_SCHEMA")
    try:
        predictor = await asyncio.to_thread(get_predictor)
        if pool is None:
            from src.tools.lakebase import LazyLakebasePool
            pool = LazyLakebasePool()

        async def infer():
            async with pool.connection() as connection:
                cursor = await connection.execute(FEATURE_SQL.format(schema=settings.bank_ro_schema),
                    {"customer_id":customer_id,"transaction_id":transaction_id})
                rows = await cursor.fetchall()
            if len(rows) != 1:
                return unavailable("OWNED_TRANSACTION_NOT_FOUND_OR_AMBIGUOUS")
            return await asyncio.to_thread(predictor.predict,dict(rows[0]))

        return await asyncio.wait_for(infer(),timeout=8)
    except Exception as error:
        # No customer identifiers, features, credentials or row values are logged.
        logger.warning("Transaction inference unavailable: %s",type(error).__name__)
        return unavailable("MODEL_OR_FEATURE_LOOKUP_UNAVAILABLE")


def transaction_risk_tool(customer_id: str | None, pool=None) -> StructuredTool:
    async def get_transaction_risk(transaction_id: str, **_ignored):
        return json.dumps(await transaction_risk(customer_id,transaction_id,pool))

    return StructuredTool.from_function(coroutine=get_transaction_risk,name="get_transaction_risk",
        description=("Computes a real experimental model score for an active transaction owned by the authenticated customer. "
            "Use the transaction_id from list_transactions. The score is uncalibrated, not a validated fraud probability; "
            "the threshold flag does not confirm fraud or innocence. Human review is always required."),
        args_schema={"type":"object","properties":{"transaction_id":{"type":"string"}},"required":["transaction_id"]},
        infer_schema=False)
