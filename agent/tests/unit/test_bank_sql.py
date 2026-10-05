from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import pytest
from psycopg_pool import PoolTimeout

from lakebase_fakes import FakePool
from src.tools import bank_sql
from src.tools.bank_sql import bank_tools
from src.tools.bind_customer import bind_customer
from src.tools.handoff import tool_rows

UC_SQL = (Path(__file__).parents[2] / "uc" / "bank_uc_consultas.sql").read_text()

PRODUCT = {
    "product_type": "Tarjeta Crédito", "product_number_last4": "4930", "currency": "USD",
    "current_balance": Decimal("120.50"), "credit_limit": Decimal("1000.00"), "available_credit": Decimal("879.50"),
}
TRANSACTION = {
    "transaction_id": "TX-TEST", "transaction_date": datetime(2026, 6, 8, 15, 0, 51, tzinfo=timezone.utc), "product_type": "Tarjeta Crédito",
    "product_number_last4": "4930", "transaction_type": "Purchase", "merchant_name": "Internet Plus",
    "amount": Decimal("329.44"), "currency": "USD", "transaction_status": "Approved",
}
CASE = {
    "complaint_id": "CMP-1", "creation_date": datetime(2025, 10, 9, 0, 18, 40), "case_type": "Complaint",
    "category": "Cargo no reconocido", "subcategory": None, "claimed_amount": Decimal("50.00"), "currency": "USD",
    "priority": "High", "status": "In Process", "is_open": True, "resolution_date": None, "resolution": None,
    "compensation_granted": None,
}


def _tools(pool):
    return {tool.name: tool for tool in bank_tools(pool)}


def _uc_columns(function: str) -> list[str]:
    body = UC_SQL.split(f"bank_uc_consultas.{function}(", 1)[1].split("RETURN\n", 1)[1].split("FROM", 1)[0]
    body = re.sub(r"CASE.*?END AS (\w+)", r"\1", body, flags=re.S)
    return [re.sub(r"^\w+\.", "", column.strip()) for column in body.replace("SELECT", "").split(",")]


def _normalized(sql: str) -> str:
    return re.sub(r"\s+", " ", sql).strip()


@pytest.mark.parametrize("template", [bank_sql.GET_PRODUCTS, bank_sql.LIST_TRANSACTIONS, bank_sql.GET_CASES])
def test_each_query_filters_by_the_bound_customer(template):
    assert "customer_id = %(customer_id)s" in template
    assert "{schema}" in template
    assert "bank_ro" in bank_sql._sql(template)


@pytest.mark.parametrize("template", [bank_sql.GET_PRODUCTS, bank_sql.LIST_TRANSACTIONS])
def test_product_queries_keep_active_cards_and_savings(template):
    assert "product_type IN ('Tarjeta Crédito', 'Cuenta Ahorro')" in template
    assert "product_status = 'Active'" in template


def test_the_queries_keep_the_order_and_limit_of_the_uc_functions():
    assert "ORDER BY t.transaction_date DESC LIMIT 10" in _normalized(bank_sql.LIST_TRANSACTIONS)
    assert "ORDER BY creation_date DESC LIMIT 10" in _normalized(bank_sql.GET_CASES)
    assert "LIMIT" not in bank_sql.GET_PRODUCTS
    assert "CASE WHEN product_type = 'Tarjeta Crédito' THEN credit_limit - current_balance ELSE NULL END" in bank_sql.GET_PRODUCTS
    assert "p.product_number_last4 = %(product_last4)s" in bank_sql.LIST_TRANSACTIONS
    assert "t.product_id = p.product_id" in bank_sql.LIST_TRANSACTIONS and "t.customer_id = p.customer_id" in bank_sql.LIST_TRANSACTIONS


@pytest.mark.parametrize("function,template,columns", [
    ("get_products", bank_sql.GET_PRODUCTS, bank_sql.GET_PRODUCTS_COLUMNS),
    ("list_transactions", bank_sql.LIST_TRANSACTIONS, bank_sql.LIST_TRANSACTIONS_COLUMNS),
    ("get_cases", bank_sql.GET_CASES, bank_sql.GET_CASES_COLUMNS),
])
def test_the_selected_columns_match_the_uc_function(function, template, columns):
    selected = template.split("FROM", 1)[0]
    selected = re.sub(r"CASE.*?END AS (\w+)", r"\1", selected, flags=re.S)
    selected = [re.sub(r"^\w+\.", "", c.strip()) for c in selected.replace("SELECT", "").split(",")]
    assert selected == columns
    # Local Lakebase inference adds the owned transaction reference; UC is unchanged.
    assert [c for c in selected if c != "transaction_id"] == _uc_columns(function)


def test_the_bank_ro_schema_must_be_a_plain_identifier(monkeypatch):
    monkeypatch.setattr(bank_sql, "settings", type("S", (), {"bank_ro_schema": "bank_ro; DROP TABLE x"})())
    with pytest.raises(ValueError):
        bank_sql._sql(bank_sql.GET_PRODUCTS)


def test_the_tools_have_the_mcp_names_and_json_schema_args():
    tools = _tools(FakePool())
    assert set(tools) == {"get_products", "list_transactions", "get_cases"}
    assert tools["get_products"].args_schema["required"] == ["customer_id"]
    assert set(tools["list_transactions"].args_schema["properties"]) == {"customer_id", "product_last4"}
    assert tools["list_transactions"].args_schema["required"] == ["customer_id"]


def test_get_products_result_parses_with_tool_rows_into_the_same_values():
    pool = FakePool(products=[PRODUCT])
    result = asyncio.run(_tools(pool)["get_products"].ainvoke({"customer_id": "CLI-1"}))

    assert tool_rows(result) == [{**PRODUCT, "current_balance": "120.50", "credit_limit": "1000.00", "available_credit": "879.50"}]
    assert pool.queries[0][1] == {"customer_id": "CLI-1"}


def test_values_are_serialized_the_way_the_mcp_does():
    pool = FakePool(transactions=[TRANSACTION], cases=[CASE])
    tools = _tools(pool)
    transaction = tool_rows(asyncio.run(tools["list_transactions"].ainvoke({"customer_id": "CLI-1"})))[0]
    case = tool_rows(asyncio.run(tools["get_cases"].ainvoke({"customer_id": "CLI-1"})))[0]

    assert transaction["transaction_date"] == "2026-06-08T15:00:51.000+0000"
    assert transaction["amount"] == "329.44" and float(transaction["amount"]) == 329.44
    assert str(transaction["transaction_date"]).startswith("2026-06-08")
    assert case["creation_date"] == "2025-10-09T00:18:40.000+0000"
    assert str(case["creation_date"])[:10] == "2025-10-09"
    assert case["is_open"] is True and case["subcategory"] is None


def test_list_transactions_binds_product_last4_or_none():
    pool = FakePool()
    tool = _tools(pool)["list_transactions"]
    asyncio.run(tool.ainvoke({"customer_id": "CLI-1", "product_last4": "4930"}))
    asyncio.run(tool.ainvoke({"customer_id": "CLI-1"}))
    assert [params for _, params in pool.queries] == [
        {"customer_id": "CLI-1", "product_last4": "4930"},
        {"customer_id": "CLI-1", "product_last4": None},
    ]


def test_no_rows_still_return_the_columns():
    result = asyncio.run(_tools(FakePool())["get_cases"].ainvoke({"customer_id": "CLI-1"}))
    assert tool_rows(result) == []
    assert '"columns"' in result


def test_bind_customer_discards_the_llms_customer_id_on_a_lakebase_tool():
    pool = FakePool(products=[PRODUCT])
    bound = bind_customer(_tools(pool)["get_products"], "CLI-SESSION")
    assert "customer_id" not in bound.args_schema["properties"]
    asyncio.run(bound.ainvoke({"customer_id": "CLI-OTHER"}))
    assert pool.queries[0][1] == {"customer_id": "CLI-SESSION"}


def test_a_pool_timeout_makes_the_tool_raise():
    tool = _tools(FakePool(error=PoolTimeout("couldn't get a connection after 5.00 sec")))["get_products"]
    with pytest.raises(PoolTimeout):
        asyncio.run(tool.ainvoke({"customer_id": "CLI-1"}))
