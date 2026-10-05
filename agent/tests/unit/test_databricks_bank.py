import asyncio
from dataclasses import replace

import pytest
from databricks.sdk.service.sql import StatementResponse

from src.tools import databricks_bank
from src.tools.bank_sql import GET_PRODUCTS, LIST_TRANSACTIONS, _sql, bank_tools
from src.tools.bind_customer import bind_customer
from src.tools.databricks_bank import DatabricksBankPool, warehouse_query


class Client:
    def __init__(self, state="SUCCEEDED", truncated=False):
        self.statement_execution = self
        self.calls = []
        self.state, self.truncated = state, truncated
        self.empty = False

    def execute_statement(self, **kwargs):
        self.calls.append(kwargs)
        return StatementResponse.from_dict({
            "status": {"state": self.state},
            "manifest": {"truncated": self.truncated, "schema": {"columns": [
                {"name": "is_open", "type_name": "BOOLEAN"},
                {"name": "amount", "type_name": "DECIMAL"},
            ]}}, "result": {"data_array": [] if self.empty else [["false", "125.40"]]},
        })


def test_only_original_select_templates_can_execute():
    for query in ("DROP TABLE x", "SELECT * FROM x", _sql(GET_PRODUCTS) + "; DELETE FROM x"):
        with pytest.raises(ValueError):
            warehouse_query(query)


def test_values_are_bound_and_customer_cannot_be_overridden():
    client = Client()
    client.empty = True
    tool = bind_customer(bank_tools(DatabricksBankPool(client))[0], "trusted-session")
    asyncio.run(tool.ainvoke({"customer_id": "untrusted"}))
    call = client.calls[0]
    assert "workspace.bank_gold.customer_products" in call["statement"]
    assert "trusted-session" not in call["statement"]
    assert [(p.name, p.value) for p in call["parameters"]] == [("customer_id", "trusted-session")]
    assert call["on_wait_timeout"].value == "CANCEL"


def test_optional_card_filter_remains_parameterized():
    query = warehouse_query(_sql(LIST_TRANSACTIONS))
    assert ":product_last4 IS NULL" in query and "::text" not in query


def test_boolean_false_is_not_treated_as_a_truthy_string():
    cursor = asyncio.run(DatabricksBankPool(Client()).execute(_sql(GET_PRODUCTS), {"customer_id": "c"}))
    assert asyncio.run(cursor.fetchall()) == [{"is_open": False, "amount": "125.40"}]


@pytest.mark.parametrize("state,truncated", [("FAILED", False), ("CANCELED", False), ("SUCCEEDED", True)])
def test_failed_or_partial_results_never_reach_the_agent(state, truncated):
    with pytest.raises(RuntimeError):
        asyncio.run(DatabricksBankPool(Client(state, truncated)).execute(_sql(GET_PRODUCTS), {"customer_id": "c"}))


def test_bad_catalog_is_rejected_before_a_request(monkeypatch):
    monkeypatch.setattr(databricks_bank, "settings", replace(databricks_bank.settings, uc_catalog="workspace;DROP"))
    with pytest.raises(ValueError):
        warehouse_query(_sql(GET_PRODUCTS))
