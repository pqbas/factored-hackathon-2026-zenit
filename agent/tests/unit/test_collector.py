import asyncio

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from src.tools.collector import (
    CollectorUnavailable,
    card_to_fetch,
    extract_fields,
    format_cards,
    format_movements,
    next_step,
)
from src.tools.handoff import PartialComplaintCase, PartialRetentionCase

CONFIRM = {
    ("complaint", "es"): "¿Confirmas estos datos para pasar tu reclamo a un asesor?",
    ("complaint", "pt"): "Você confirma estes dados para passar sua reclamação a um atendente?",
    ("retention", "es"): "¿Confirmas estos datos para pasar tu solicitud a un asesor?",
    ("retention", "pt"): "Você confirma estes dados para passar sua solicitação a um atendente?",
}

PRODUCTS = [
    {"product_type": "Tarjeta Crédito", "product_number_last4": "4930", "currency": "USD"},
    {"product_type": "Tarjeta Crédito", "product_number_last4": "1070", "currency": "PEN"},
    {"product_type": "Cuenta Ahorros", "product_number_last4": "5566", "currency": "USD"},
]


def _tx(date, merchant, amount, card="4930", currency="USD"):
    return {
        "transaction_date": f"{date}T15:00:51.000+0000", "product_number_last4": card,
        "merchant_name": merchant, "amount": amount, "currency": currency, "transaction_status": "Approved",
    }


TRANSACTIONS = [
    _tx("2026-06-08", "Internet Plus", 329.44),
    _tx("2026-06-10", "Uber Eats", 18.5),
    _tx("2026-06-12", None, 500.0),
    _tx("2026-06-12", "Uber Eats", 22.0),
    _tx("2026-06-01", "Netflix", 9.99, card="1070"),
]
ROWS = {"get_products": PRODUCTS, "list_transactions": TRANSACTIONS}

FULL = dict(
    card_last4="4930", transaction_date="2026-06-08", merchant="Internet Plus", amount=329.44,
    complaint_type="not_recognized", description="Nunca contraté ese servicio",
)


def _complaint(**overrides):
    return PartialComplaintCase(**{**FULL, **overrides})


def _step(fields, language="es", rows=ROWS, reason="complaint"):
    return next_step(reason, fields, rows, language)


def test_a_complaint_with_nothing_given_asks_the_card_and_lists_the_customers_cards():
    kind, text = _step(PartialComplaintCase())
    assert kind == "ask"
    assert text.startswith("¿De qué tarjeta es el cargo?")
    assert "- terminada en 4930 (USD)" in text and "- terminada en 1070 (PEN)" in text
    assert "5566" not in text


def test_a_card_that_is_not_the_customers_is_said_and_asked_again_with_the_real_cards():
    kind, text = _step(PartialComplaintCase(card_last4="9999"))
    assert kind == "ask"
    assert text.startswith("No encuentro esa tarjeta entre las tuyas.")
    assert "¿De qué tarjeta es el cargo?" in text and "4930" in text


def test_a_customer_with_a_single_card_is_not_asked_which_one():
    rows = {**ROWS, "get_products": [PRODUCTS[0], PRODUCTS[2]]}
    kind, text = _step(PartialComplaintCase(), rows=rows)
    assert text.startswith("¿Cuál es el cargo?") and "terminada en 4930" in text
    assert card_to_fetch("complaint", PartialComplaintCase(), rows) == "4930"


def test_a_customer_with_a_single_product_is_not_asked_which_one():
    rows = {"get_products": [PRODUCTS[0]]}
    assert _step(PartialRetentionCase(), reason="retention", rows=rows) == ("ask", "¿Por qué quieres cancelarlo?")


def test_a_savings_account_is_not_a_card_of_the_complaint():
    kind, text = _step(PartialComplaintCase(card_last4="5566"))
    assert text.startswith("No encuentro esa tarjeta")


def test_a_card_without_a_charge_asks_the_charge_with_the_cards_charges_only():
    kind, text = _step(PartialComplaintCase(card_last4="4930"))
    assert kind == "ask"
    assert text.startswith("¿Cuál es el cargo?")
    assert "terminada en 4930" in text
    assert "08/06/2026 · Internet Plus · 329.44 USD" in text
    # the payment without merchant and the other card's movement are not options
    assert "500.00" not in text and "Netflix" not in text


def test_a_charge_that_is_not_in_the_movements_is_said_and_asked_again_with_the_real_ones():
    kind, text = _step(_complaint(merchant="Amazon", amount=None, transaction_date=None))
    assert kind == "ask"
    assert text.startswith("No encuentro ese cargo en los movimientos de esa tarjeta.")
    assert "¿Cuál es el cargo?" in text and "Internet Plus" in text


def test_a_charge_matching_several_movements_is_asked_again():
    kind, text = _step(_complaint(merchant="uber", amount=None, transaction_date=None))
    assert kind == "ask"
    assert text.startswith("¿Cuál es el cargo?")
    assert "18.50 USD" in text and "22.00 USD" in text


def test_a_partial_charge_that_is_unique_is_enough():
    kind, text = _step(_complaint(merchant="internet", amount=None, transaction_date=None, complaint_type=None))
    assert (kind, text) == ("ask", "¿Qué pasó? No lo reconozco, me cobraron dos veces o el monto es distinto.")


def test_a_charge_date_in_the_lists_format_is_read():
    kind, text = _step(_complaint(merchant=None, amount=None, transaction_date="10/06/2026", complaint_type=None))
    assert text.startswith("¿Qué pasó?")


def test_the_type_is_asked_after_the_charge_and_the_description_after_the_type():
    assert _step(_complaint(complaint_type=None, description=None))[1].startswith("¿Qué pasó?")
    assert _step(_complaint(description=None)) == ("ask", "Cuéntame brevemente lo que pasó.")
    assert _step(_complaint(description="   "))[1] == "Cuéntame brevemente lo que pasó."


def test_a_field_already_given_is_never_asked_again_whatever_is_missing_after_it():
    # the description given without the type: the type is still the first missing field
    kind, text = _step(_complaint(complaint_type=None))
    assert text.startswith("¿Qué pasó?")
    assert "tarjeta" not in text and "cargo?" not in text


@pytest.mark.parametrize("language", ["es", "pt"])
def test_a_complete_complaint_gets_the_summary_ending_in_the_exact_confirmation_question(language):
    kind, text = _step(_complaint(), language)
    assert kind == "summary"
    assert text.splitlines()[-1] == CONFIRM[("complaint", language)]
    assert "4930" in text and "08/06/2026 · Internet Plus · 329.44 USD" in text
    assert "Nunca contraté ese servicio" in text


def test_the_summary_type_uses_the_customers_language():
    _, text = _step(_complaint(complaint_type="duplicate_charge"), "pt")
    assert "fui cobrado duas vezes" in text


def test_a_multi_line_description_stays_before_the_confirmation_question():
    _, text = _step(_complaint(description="línea uno\nlínea dos"))
    assert "línea uno línea dos" in text
    assert text.splitlines()[-1] == CONFIRM[("complaint", "es")]


def test_the_portuguese_questions_are_portuguese():
    assert _step(PartialComplaintCase(), "pt")[1].startswith("De qual cartão é a cobrança?")
    assert "com final 4930" in _step(PartialComplaintCase(), "pt")[1]
    assert _step(PartialComplaintCase(card_last4="4930"), "pt")[1].startswith("Qual é a cobrança?")
    assert _step(_complaint(complaint_type=None), "pt")[1].startswith("O que aconteceu?")
    assert _step(_complaint(description=None), "pt")[1] == "Me conte brevemente o que aconteceu."
    assert _step(PartialComplaintCase(card_last4="9999"), "pt")[1].startswith("Não encontro esse cartão")


def test_a_complaint_without_cards_or_movements_is_left_to_the_llm():
    with pytest.raises(CollectorUnavailable):
        _step(PartialComplaintCase(), rows={"get_products": [PRODUCTS[2]]})
    with pytest.raises(CollectorUnavailable):
        _step(PartialComplaintCase(card_last4="4930"), rows={"get_products": PRODUCTS})


def test_retention_with_nothing_given_asks_the_product_and_lists_all_the_customers_products():
    kind, text = _step(PartialRetentionCase(), reason="retention")
    assert kind == "ask"
    assert text.startswith("¿Qué producto quieres cancelar?")
    assert "- Tarjeta Crédito terminada en 4930 (USD)" in text and "- Cuenta Ahorros terminada en 5566 (USD)" in text


def test_a_product_that_is_not_the_customers_is_said_and_asked_again():
    kind, text = _step(PartialRetentionCase(product_last4="0000"), reason="retention")
    assert text.startswith("No encuentro ese producto entre los tuyos.")
    assert "¿Qué producto quieres cancelar?" in text and "5566" in text


def test_retention_asks_the_reason_after_the_product():
    assert _step(PartialRetentionCase(product_last4="1070"), reason="retention") == (
        "ask", "¿Por qué quieres cancelarlo?",
    )


@pytest.mark.parametrize("language", ["es", "pt"])
def test_a_complete_retention_gets_the_summary_ending_in_the_exact_confirmation_question(language):
    fields = PartialRetentionCase(product_last4="1070", reason="comisión muy alta")
    kind, text = _step(fields, language, reason="retention")
    assert kind == "summary"
    assert text.splitlines()[-1] == CONFIRM[("retention", language)]
    assert "1070" in text and "comisión muy alta" in text


def test_retention_without_products_is_left_to_the_llm():
    with pytest.raises(CollectorUnavailable):
        _step(PartialRetentionCase(), reason="retention", rows={})


def test_options_are_formatted_one_per_line():
    assert format_cards(PRODUCTS[:2]) == "- terminada en 4930 (USD)\n- terminada en 1070 (PEN)"
    assert format_movements(TRANSACTIONS[:1]) == "- 08/06/2026 · Internet Plus · 329.44 USD"


def test_only_the_eight_latest_movements_are_listed():
    rows = [_tx(f"2026-05-{day:02d}", f"Shop {day}", 1.0 + day) for day in range(1, 13)]
    assert len(format_movements(rows).splitlines()) == 8


def test_card_to_fetch_is_a_complaints_card_that_is_the_customers():
    assert card_to_fetch("complaint", PartialComplaintCase(card_last4="terminada en 4930"), ROWS) == "4930"
    assert card_to_fetch("complaint", PartialComplaintCase(card_last4="9999"), ROWS) is None
    assert card_to_fetch("complaint", PartialComplaintCase(card_last4="5566"), ROWS) is None
    assert card_to_fetch("complaint", PartialComplaintCase(), ROWS) is None
    assert card_to_fetch("retention", PartialRetentionCase(product_last4="1070"), ROWS) is None


class _Structured:
    def __init__(self, answer=None, delay=0, error=None):
        self.answer, self.delay, self.error, self.received = answer, delay, error, None

    def with_structured_output(self, schema):
        self.schema = schema
        return self

    async def ainvoke(self, messages):
        self.received = messages
        await asyncio.sleep(self.delay)
        if self.error:
            raise self.error
        return self.answer


def test_extract_fields_returns_the_structured_answer_over_the_whole_conversation():
    llm = _Structured(PartialComplaintCase(card_last4="4930"))
    messages = [HumanMessage(content="hola"), AIMessage(content="¿De qué tarjeta?"), HumanMessage(content="la 4930")]
    fields = asyncio.run(extract_fields(llm, "complaint", messages))
    assert fields.card_last4 == "4930"
    assert llm.schema is PartialComplaintCase
    assert llm.received[1:] == messages


def test_extract_fields_accepts_a_dict_answer():
    llm = _Structured({"product_last4": "1070"})
    assert asyncio.run(extract_fields(llm, "retention", [HumanMessage(content="la 1070")])).product_last4 == "1070"


def test_extract_fields_drops_a_card_the_customer_never_wrote():
    llm = _Structured(PartialComplaintCase(card_last4="5170", merchant="Internet Plus"))
    messages = [
        HumanMessage(content="não reconheço uma cobrança"),
        AIMessage(content="De qual cartão é a cobrança?\n- com final 5170 (ARS)"),
        HumanMessage(content="o da Internet Plus"),
    ]
    fields = asyncio.run(extract_fields(llm, "complaint", messages))
    assert fields.card_last4 is None
    assert fields.merchant == "Internet Plus"


def test_extract_fields_keeps_digits_the_customer_wrote_in_any_form():
    llm = _Structured(PartialComplaintCase(card_last4="4930"))
    messages = [HumanMessage(content="mi tarjeta termina en 4 9 3 0")]
    assert asyncio.run(extract_fields(llm, "complaint", messages)).card_last4 == "4930"


@pytest.mark.parametrize("llm", [
    _Structured(error=RuntimeError("boom")), _Structured(None), _Structured(delay=1), object(),
])
def test_extract_fields_raises_collector_unavailable_on_error_empty_answer_timeout_or_no_structured_output(llm):
    with pytest.raises(CollectorUnavailable):
        asyncio.run(extract_fields(llm, "complaint", [], timeout=0.05))


def test_the_partial_schemas_have_the_cases_fields_all_optional():
    assert PartialComplaintCase().model_dump() == dict.fromkeys(FULL)
    assert set(PartialRetentionCase.model_fields) == {"product_last4", "reason"}
    with pytest.raises(ValueError):
        PartialComplaintCase(complaint_type="whatever")
