from __future__ import annotations

import asyncio
import logging
import re
from typing import Literal

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel

from src.llm.fallback import normalize
from src.prompts import messages as texts
from src.tools.handoff import PartialComplaintCase, PartialRetentionCase

logger = logging.getLogger(__name__)

EXTRACTION_TIMEOUT_SECONDS = 4.0
# The movements listed to the customer to pick a charge from; the charge itself is matched
# against all of them.
_MAX_MOVEMENTS = 8

_PARTIAL_CASES: dict[str, type[BaseModel]] = {
    "complaint": PartialComplaintCase,
    "retention": PartialRetentionCase,
}

_EXTRACTION_PROMPT = (
    "You read a conversation between a bank's assistant (David) and a customer who is "
    "{request}. Fill in only the fields of the case that the customer gave, in the whole "
    "conversation. Leave a field empty when the customer did not give it; never guess and never "
    "invent a value. If the customer corrected a value, use the latest one. The assistant's "
    "messages only help you understand what the customer's answers refer to: never take a value "
    "from an assistant message the customer did not choose or confirm.\n"
    "- card_last4 and product_last4: the last 4 digits the customer named or picked from a list.\n"
    "- transaction_date, merchant, amount: the charge the customer described or picked from the "
    "list of movements (dates in that list are DD/MM/YYYY; write transaction_date as YYYY-MM-DD). "
    "Give whatever the customer said about it, even if only the merchant.\n"
    "- complaint_type: only if the customer said what happened.\n"
    "- description and reason: only what the customer said in their own words in answer to "
    "\"Cuéntame brevemente lo que pasó\" or \"¿Por qué quieres cancelarlo?\", or spontaneously "
    "explained beyond the type of complaint. Never copy the type of complaint as the description."
)
_REQUESTS = {
    "complaint": "disputing a credit card charge",
    "retention": "asking to cancel one of their bank products",
}


class CollectorUnavailable(Exception):
    """The extraction failed or timed out: respond falls back to the LLM's own collection."""


async def extract_fields(llm, reason: str, messages: list, timeout: float = EXTRACTION_TIMEOUT_SECONDS) -> BaseModel:
    """The fields of the case the customer has given so far: one structured-output call."""
    schema = _PARTIAL_CASES[reason]
    system = SystemMessage(content=_EXTRACTION_PROMPT.format(request=_REQUESTS[reason]))
    try:
        structured = llm.with_structured_output(schema)
        answer = await asyncio.wait_for(structured.ainvoke([system, *messages]), timeout=timeout)
    except asyncio.TimeoutError as exc:
        raise CollectorUnavailable(f"timed out after {timeout}s") from exc
    except Exception as exc:  # noqa: BLE001 - any LLM or parsing error falls back to the LLM's path
        # The type only: a parsing error's message can quote what the LLM echoed back.
        raise CollectorUnavailable(type(exc).__name__) from exc
    if answer is None:
        raise CollectorUnavailable("empty answer")
    fields = answer if isinstance(answer, schema) else schema.model_validate(answer)
    return _grounded(fields, messages)


def _grounded(fields, messages: list):
    """Drops the card or product digits the customer never wrote: the LLM filled them in on its
    own (a card named by nobody). A customer who picks from the list types its digits."""
    typed = [re.sub(r"\D", "", text) for text in _human_texts(messages)]
    updates = {
        name: None
        for name in ("card_last4", "product_last4")
        if getattr(fields, name, None) and not any((_last4(getattr(fields, name)) or "\0") in t for t in typed)
    }
    return fields.model_copy(update=updates) if updates else fields


def _human_texts(messages: list) -> list[str]:
    return [
        m.content if isinstance(m.content, str) else str(m.content)
        for m in messages
        if isinstance(m, HumanMessage)
    ]


def _last4(value: str | None) -> str | None:
    digits = re.sub(r"\D", "", value or "")
    return digits[-4:] if len(digits) >= 4 else None


def _iso_date(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip()
    if match := re.match(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", value):
        return f"{match.group(3)}-{int(match.group(2)):02d}-{int(match.group(1)):02d}"
    return value[:10]


def _display_date(value) -> str:
    year, month, day = str(value)[:10].split("-")
    return f"{day}/{month}/{year}"


def _cards(rows_by_tool: dict) -> list[dict]:
    return [p for p in rows_by_tool.get("get_products", []) if p["product_type"].startswith("Tarjeta")]


def _movements(rows_by_tool: dict, card: str) -> list[dict]:
    # Payments and withdrawals have no merchant: only charges can be disputed.
    charges = [
        t for t in rows_by_tool.get("list_transactions", [])
        if t["product_number_last4"] == card and (t["merchant_name"] or "").strip()
    ]
    return sorted(charges, key=lambda t: str(t["transaction_date"]), reverse=True)


def format_cards(rows: list[dict], language: str = "es") -> str:
    return "\n".join(
        "- " + texts.CARD_CHOICE[language].format(last4=row["product_number_last4"], currency=row["currency"])
        for row in rows
    )


def _product_label(row: dict, language: str) -> str:
    return texts.PRODUCT_CHOICE[language].format(
        product_type=row["product_type"], last4=row["product_number_last4"], currency=row["currency"]
    )


def format_products(rows: list[dict], language: str = "es") -> str:
    return "\n".join(f"- {_product_label(row, language)}" for row in rows)


def format_movement(row: dict) -> str:
    return f"{_display_date(row['transaction_date'])} · {row['merchant_name']} · {float(row['amount']):.2f} {row['currency']}"


def format_movements(rows: list[dict]) -> str:
    return "\n".join(f"- {format_movement(row)}" for row in rows[:_MAX_MOVEMENTS])


def _matching_charges(fields, movements: list[dict]) -> list[dict]:
    date, merchant, amount = _iso_date(fields.transaction_date), (fields.merchant or "").strip().lower(), fields.amount
    return [
        t for t in movements
        if (date is None or str(t["transaction_date"]).startswith(date))
        and (not merchant or merchant in t["merchant_name"].lower() or t["merchant_name"].lower() in merchant)
        and (amount is None or abs(float(t["amount"]) - amount) < 0.01)
    ]


def _named_or_only(named: str | None, rows: list[dict]) -> str | None:
    """The digits the customer named, or the customer's only one: with a single card or product
    there is nothing to ask (docs/flujo-atencion.md, 3.C and 3.D1: "si tiene una sola, la propone")."""
    if named is None and len(rows) == 1:
        return rows[0]["product_number_last4"]
    return named


def card_to_fetch(reason: str, fields, rows_by_tool: dict) -> str | None:
    """The last 4 digits of the card the customer named, if it is one of theirs: the caller
    fetches its movements."""
    if reason != "complaint":
        return None
    card = _named_or_only(_last4(fields.card_last4), _cards(rows_by_tool))
    return card if card in {c["product_number_last4"] for c in _cards(rows_by_tool)} else None


def next_step(
    reason: str, fields, rows_by_tool: dict[str, list[dict]], language: str = "es", messages: list | None = None
) -> tuple[Literal["ask", "summary"], str]:
    """The fixed question for the first missing or mismatching field of the case, or the summary
    when every field is there and matches the bank's rows. Calls nothing."""
    if reason == "retention":
        return _retention_step(fields, rows_by_tool, language, messages or [])
    return _complaint_step(fields, rows_by_tool, language)


def _complaint_step(fields, rows_by_tool: dict, language: str):
    cards = _cards(rows_by_tool)
    if not cards:
        raise CollectorUnavailable("no cards")
    card = _named_or_only(_last4(fields.card_last4), cards)
    if card is None:
        return "ask", texts.ASK_CARD[language].format(options=format_cards(cards, language))
    if card not in {c["product_number_last4"] for c in cards}:
        return "ask", _not_found("card", language) + texts.ASK_CARD[language].format(options=format_cards(cards, language))

    movements = _movements(rows_by_tool, card)
    if not movements:
        raise CollectorUnavailable("no movements")
    ask_charge = texts.ASK_CHARGE[language].format(last4=card, options=format_movements(movements))
    if fields.transaction_date is None and not fields.merchant and fields.amount is None:
        return "ask", ask_charge
    matches = _matching_charges(fields, movements)
    if not matches:
        return "ask", _not_found("charge", language) + ask_charge
    if len(matches) > 1:
        return "ask", ask_charge
    if fields.complaint_type is None:
        return "ask", texts.ASK_TYPE[language]
    description = " ".join((fields.description or "").split())
    if not description:
        return "ask", texts.ASK_DESCRIPTION[language]
    summary = texts.COMPLAINT_SUMMARY[language].format(
        card_last4=card,
        charge=format_movement(matches[0]),
        complaint_type=texts.COMPLAINT_TYPE_LABEL[fields.complaint_type][language],
        description=description,
    )
    return "summary", summary


_KIND_WORDS = (
    (re.compile(r"\b(tarjeta|cartao)\b"), "Tarjeta"),
    (re.compile(r"\b(cuenta|ahorro|conta|poupanca)\b"), "Cuenta"),
)


def _kind_named(messages: list) -> str | None:
    """The kind of product ("Tarjeta", "Cuenta") the customer named in their latest message
    that names exactly one kind."""
    for text in reversed(_human_texts(messages)):
        kinds = {kind for pattern, kind in _KIND_WORDS if pattern.search(normalize(text))}
        if len(kinds) == 1:
            return kinds.pop()
    return None


def _retention_step(fields, rows_by_tool: dict, language: str, messages: list):
    products = rows_by_tool.get("get_products", [])
    if not products:
        raise CollectorUnavailable("no products")
    # "Cerrar mi tarjeta" with one card is that card; with several, only the cards are listed.
    candidates = products
    if kind := _kind_named(messages):
        candidates = [p for p in products if p["product_type"].startswith(kind)] or products
    ask_product = texts.ASK_PRODUCT[language].format(options=format_products(candidates, language))
    last4 = _named_or_only(_last4(fields.product_last4), candidates)
    if last4 is None:
        return "ask", ask_product
    product = next((p for p in products if p["product_number_last4"] == last4), None)
    if product is None:
        return "ask", _not_found("product", language) + ask_product
    reason = " ".join((fields.reason or "").split())
    if not reason:
        return "ask", texts.ASK_REASON[language]
    summary = texts.RETENTION_SUMMARY[language].format(product=_product_label(product, language), reason=reason)
    return "summary", summary


def _not_found(what: str, language: str) -> str:
    return texts.NOT_THE_CUSTOMERS[what][language] + "\n\n"
