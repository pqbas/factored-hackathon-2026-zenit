from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from langchain_core.tools import StructuredTool

from src.config import settings

# Mirror of uc/bank_uc_consultas.sql over the synced tables in bank_ro. The only values
# bound are the session's customer_id and the product_last4 the LLM passes.
GET_PRODUCTS = """
SELECT
  product_type,
  product_number_last4,
  currency,
  current_balance,
  credit_limit,
  CASE WHEN product_type = 'Tarjeta Crédito' THEN credit_limit - current_balance ELSE NULL END AS available_credit
FROM {schema}.customer_products
WHERE customer_id = %(customer_id)s
  AND product_type IN ('Tarjeta Crédito', 'Cuenta Ahorro')
  AND product_status = 'Active'
"""

LIST_TRANSACTIONS = """
SELECT
  t.transaction_id,
  t.transaction_date,
  p.product_type,
  p.product_number_last4,
  t.transaction_type,
  t.merchant_name,
  t.amount,
  t.currency,
  t.transaction_status
FROM {schema}.customer_transactions t
JOIN {schema}.customer_products p
  ON t.product_id = p.product_id AND t.customer_id = p.customer_id
WHERE t.customer_id = %(customer_id)s
  AND p.product_type IN ('Tarjeta Crédito', 'Cuenta Ahorro')
  AND p.product_status = 'Active'
  AND (%(product_last4)s::text IS NULL OR p.product_number_last4 = %(product_last4)s::text)
ORDER BY t.transaction_date DESC
LIMIT 10
"""

GET_CASES = """
SELECT
  complaint_id,
  creation_date,
  case_type,
  category,
  subcategory,
  claimed_amount,
  currency,
  priority,
  status,
  is_open,
  resolution_date,
  resolution,
  compensation_granted
FROM {schema}.customer_cases
WHERE customer_id = %(customer_id)s
ORDER BY creation_date DESC
LIMIT 10
"""

GET_PRODUCTS_COLUMNS = [
    "product_type", "product_number_last4", "currency", "current_balance", "credit_limit", "available_credit",
]
LIST_TRANSACTIONS_COLUMNS = [
    "transaction_id",
    "transaction_date", "product_type", "product_number_last4", "transaction_type", "merchant_name",
    "amount", "currency", "transaction_status",
]
GET_CASES_COLUMNS = [
    "complaint_id", "creation_date", "case_type", "category", "subcategory", "claimed_amount", "currency",
    "priority", "status", "is_open", "resolution_date", "resolution", "compensation_granted",
]

_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")


def _sql(template: str) -> str:
    schema = settings.bank_ro_schema
    if not _IDENTIFIER.match(schema):
        raise ValueError(f"BANK_RO_SCHEMA must be a plain identifier, got {schema!r}")
    return template.format(schema=schema)


def _value(value: Any) -> Any:
    # The MCP returns timestamps as 2025-10-09T00:18:40.000+0000 and decimals as strings.
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}" + value.strftime("%z")
    if isinstance(value, Decimal):
        return str(value)
    return value


async def _run(pool, template: str, columns: list[str], params: dict[str, Any]) -> str:
    async with pool.connection() as conn:
        cursor = await conn.execute(_sql(template), params)
        rows = await cursor.fetchall()
    return json.dumps({"columns": columns, "rows": [[_value(row[c]) for c in columns] for row in rows]})


def bank_tools(pool) -> list[StructuredTool]:
    async def get_products(customer_id: str) -> str:
        return await _run(pool, GET_PRODUCTS, GET_PRODUCTS_COLUMNS, {"customer_id": customer_id})

    async def list_transactions(customer_id: str, product_last4: str | None = None) -> str:
        params = {"customer_id": customer_id, "product_last4": product_last4}
        return await _run(pool, LIST_TRANSACTIONS, LIST_TRANSACTIONS_COLUMNS, params)

    async def get_cases(customer_id: str) -> str:
        return await _run(pool, GET_CASES, GET_CASES_COLUMNS, {"customer_id": customer_id})

    customer = {"type": "string", "description": "The session customer id."}
    return [
        StructuredTool.from_function(
            coroutine=get_products,
            name="get_products",
            description="Returns the customer active credit cards and savings accounts: last 4 digits, currency, "
            "current balance, credit limit and available credit (credit_limit - current_balance, NULL for savings accounts).",
            args_schema={"type": "object", "properties": {"customer_id": customer}, "required": ["customer_id"]},
            infer_schema=False,
        ),
        StructuredTool.from_function(
            coroutine=list_transactions,
            name="list_transactions",
            description="Returns the 10 most recent movements of the customer active credit cards and savings accounts, "
            "each with its date, product, last 4 digits, type, merchant, amount and status. Pass product_last4 to see "
            "only one product movements.",
            args_schema={
                "type": "object",
                "properties": {
                    "customer_id": customer,
                    "product_last4": {
                        "type": "string",
                        "description": "Last 4 digits of a single card or account to filter to; omit to return movements of every active product.",
                    },
                },
                "required": ["customer_id"],
            },
            infer_schema=False,
        ),
        StructuredTool.from_function(
            coroutine=get_cases,
            name="get_cases",
            description="Returns the customer 10 most recent complaints and cases: id, date, type, category, subcategory, "
            "claimed amount and currency, priority, status (Open, In Process, Resolved, Closed, Rejected), whether it is "
            "open, resolution date, resolution and compensation granted.",
            args_schema={"type": "object", "properties": {"customer_id": customer}, "required": ["customer_id"]},
            infer_schema=False,
        ),
    ]
