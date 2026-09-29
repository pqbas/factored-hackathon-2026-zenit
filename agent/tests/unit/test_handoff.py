from __future__ import annotations

import asyncio
import json

from langchain_core.messages import AIMessage

from src.tools.handoff import case_summary, tool_rows, verify_case

PRODUCTS = [
    {"product_type": "Tarjeta Crédito", "product_number_last4": "4930", "currency": "USD"},
    {"product_type": "Cuenta Ahorro", "product_number_last4": "4161", "currency": "USD"},
]
TRANSACTIONS = [
    {"transaction_date": "2026-06-08T15:00:51.000+0000", "product_number_last4": "4930",
     "merchant_name": "Internet Plus", "amount": 329.44, "currency": "USD", "transaction_status": "Approved"},
]
COMPLAINT = {
    "card_last4": "4930", "transaction_date": "2026-06-08", "merchant": "internet plus", "amount": 329.44,
    "complaint_type": "not_recognized", "description": "Nunca contraté ese servicio",
}


def test_tool_rows_reads_the_uc_query_result():
    result = [{"type": "text", "text": json.dumps({"columns": ["a", "b"], "rows": [[1, "x"], [2, "y"]]})}]
    assert tool_rows(result) == [{"a": 1, "b": "x"}, {"a": 2, "b": "y"}]
    assert tool_rows("not json") == []


def test_a_complaint_matching_the_bank_rows_is_verified_with_the_banks_values():
    verified = verify_case("complaint", COMPLAINT, {"get_products": PRODUCTS, "list_transactions": TRANSACTIONS})
    assert verified == {
        "card_last4": "4930", "transaction_date": "2026-06-08", "merchant": "Internet Plus", "amount": 329.44,
        "currency": "USD", "transaction_status": "Approved", "complaint_type": "not_recognized",
        "description": "Nunca contraté ese servicio",
    }


def test_a_charge_not_in_the_movements_is_rejected():
    error = verify_case("complaint", {**COMPLAINT, "amount": 100.0},
                        {"get_products": PRODUCTS, "list_transactions": TRANSACTIONS})
    assert isinstance(error, str) and "no está en los movimientos" in error


def test_a_card_that_is_not_the_customers_is_rejected():
    error = verify_case("complaint", {**COMPLAINT, "card_last4": "4161"},
                        {"get_products": PRODUCTS, "list_transactions": TRANSACTIONS})
    assert isinstance(error, str) and "4161" in error


def test_without_tool_results_in_the_turn_the_llm_is_told_to_verify_first():
    assert "get_products" in verify_case("complaint", COMPLAINT, {})
    assert "list_transactions" in verify_case("complaint", COMPLAINT, {"get_products": PRODUCTS})


def test_a_missing_field_is_named():
    args = {k: v for k, v in COMPLAINT.items() if k != "description"}
    assert "description" in verify_case("complaint", args, {"get_products": PRODUCTS})


def test_a_retention_is_verified_against_the_products():
    verified = verify_case("retention", {"product_last4": "4161", "reason": "no la uso"}, {"get_products": PRODUCTS})
    assert verified == {"product_type": "Cuenta Ahorro", "product_last4": "4161", "currency": "USD", "reason": "no la uso"}
    assert isinstance(verify_case("retention", {"product_last4": "0000", "reason": "x"}, {"get_products": PRODUCTS}), str)


class _SummaryLLM:
    def __init__(self, text=None, raises=False):
        self._text, self._raises = text, raises
        self.received = None

    async def ainvoke(self, messages):
        self.received = messages
        if self._raises:
            raise RuntimeError("down")
        return AIMessage(content=self._text)


def test_the_summary_is_the_llm_text_and_names_the_request_in_words():
    llm = _SummaryLLM("El cliente pide cancelar su tarjeta 4161.")
    assert asyncio.run(case_summary(llm, "retention", {"product_last4": "4161"})) == "El cliente pide cancelar su tarjeta 4161."
    assert "cancelar un producto" in llm.received[1].content


def test_a_failing_summary_is_none():
    assert asyncio.run(case_summary(_SummaryLLM(raises=True), "complaint", {})) is None


def test_movements_without_a_merchant_dont_break_the_check():
    transactions = [{**TRANSACTIONS[0], "merchant_name": None, "amount": 10.0}, *TRANSACTIONS]
    verified = verify_case("complaint", COMPLAINT, {"get_products": PRODUCTS, "list_transactions": transactions})
    assert verified["merchant"] == "Internet Plus"
CASES = [
    {"complaint_id": "CMP-1", "creation_date": "2025-10-09T00:18:40.000+0000", "subcategory": "Cargo no reconocido",
     "claimed_amount": None, "currency": None, "status": "In Process", "resolution": None},
]


def test_a_case_status_on_a_known_case_is_verified_with_the_banks_values():
    verified = verify_case("case_status", {"complaint_id": "CMP-1", "need": "saber el plazo"}, {"get_cases": CASES})
    assert verified == {
        "complaint_id": "CMP-1", "creation_date": "2025-10-09", "subcategory": "Cargo no reconocido",
        "claimed_amount": None, "currency": None, "status": "In Process", "resolution": None, "need": "saber el plazo",
    }


def test_a_case_status_on_an_unknown_case_id_is_rejected():
    assert "CMP-9" in verify_case("case_status", {"complaint_id": "CMP-9", "need": "x"}, {"get_cases": CASES})


def test_a_case_not_in_get_cases_is_verified_by_its_charge():
    args = {"card_last4": "4930", "transaction_date": "2026-06-08", "merchant": "Internet Plus", "amount": 329.44,
            "need": "saber si lo recibieron"}
    verified = verify_case("case_status", args, {"get_products": PRODUCTS, "list_transactions": TRANSACTIONS})
    assert verified["merchant"] == "Internet Plus" and verified["need"] == "saber si lo recibieron"


def test_a_case_status_without_the_case_or_its_charge_asks_for_it():
    assert "complaint_id" in verify_case("case_status", {"need": "x"}, {})
