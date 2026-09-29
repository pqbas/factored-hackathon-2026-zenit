from __future__ import annotations

import asyncio
import json
import logging
from typing import Literal

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field, ValidationError

logger = logging.getLogger(__name__)

# docs/flujo-atencion.md, etapa 5: the local tool the LLM calls once the customer confirmed
# the case summary. It never runs as a tool: respond verifies its arguments against the bank
# data the UC tools returned in this turn and, if they match, hands the case off.
HANDOFF_TOOL_NAME = "hand_off_to_advisor"

_SUMMARY_TIMEOUT_SECONDS = 4.0


class ComplaintCase(BaseModel):
    card_last4: str = Field(description="Last 4 digits of the credit card of the charge.")
    transaction_date: str = Field(description="Date of the charge, YYYY-MM-DD, as list_transactions returned it.")
    merchant: str = Field(description="Merchant of the charge, as list_transactions returned it.")
    amount: float = Field(description="Amount of the charge, as list_transactions returned it.")
    complaint_type: Literal["not_recognized", "duplicate_charge", "different_amount"] = Field(
        description="not_recognized: the customer doesn't recognize it; duplicate_charge: charged twice; "
        "different_amount: the amount is not what the customer expected."
    )
    description: str = Field(description="What happened, in the customer's words.")


class RetentionCase(BaseModel):
    product_last4: str = Field(description="Last 4 digits of the product to cancel.")
    reason: str = Field(description="Why the customer wants to cancel it, in their words.")


class CaseStatusCase(BaseModel):
    complaint_id: str | None = Field(
        default=None, description="complaint_id of the case, as get_cases returned it, if it is there."
    )
    card_last4: str | None = Field(default=None, description="Only if the case is not in get_cases: card of the charge.")
    transaction_date: str | None = Field(default=None, description="Only if the case is not in get_cases: date of the charge, YYYY-MM-DD.")
    merchant: str | None = Field(default=None, description="Only if the case is not in get_cases: merchant of the charge.")
    amount: float | None = Field(default=None, description="Only if the case is not in get_cases: amount of the charge.")
    need: str = Field(description="What the customer needs about the case, in their words.")


_CASES: dict[str, type[BaseModel]] = {
    "complaint": ComplaintCase,
    "retention": RetentionCase,
    "case_status": CaseStatusCase,
}
# What the customer asks for, in words: the bare reason ("retention") misled the summary.
_REQUESTS = {
    "complaint": "reclamo por un cargo de tarjeta",
    "retention": "cancelar un producto",
    "case_status": "consulta sobre un reclamo existente",
}


def handoff_tool(reason: str) -> StructuredTool:
    async def _never_called(**_):  # respond intercepts the call before any tool runs
        raise RuntimeError(f"{HANDOFF_TOOL_NAME} is handled by respond")

    return StructuredTool.from_function(
        coroutine=_never_called,
        name=HANDOFF_TOOL_NAME,
        description=(
            "Hands the confirmed case off to a human advisor. Call it only after the customer "
            "confirmed the case summary, in a turn where you already called the tools that "
            "verify its data."
        ),
        args_schema=_CASES[reason],
    )


def tool_rows(result) -> list[dict]:
    """The rows a UC tool returned, as dicts; [] if the result isn't a query result."""
    items = result if isinstance(result, list) else [result]
    rows: list[dict] = []
    for item in items:
        text = item.get("text") if isinstance(item, dict) else item
        try:
            payload = json.loads(text)
            rows += [dict(zip(payload["columns"], row)) for row in payload["rows"]]
        except (TypeError, ValueError, KeyError):
            continue
    return rows


def verify_case(reason: str, args: dict, rows_by_tool: dict[str, list[dict]]) -> dict | str:
    """The case's verified data, taken from the bank's rows, or an error for the LLM."""
    try:
        case = _CASES[reason].model_validate(args)
    except ValidationError as exc:
        return f"Datos incompletos: {exc.errors()[0]['loc'][0]}. Pregúntale al cliente el dato que falta."
    if reason == "case_status":
        return _verify_case_status(case, rows_by_tool)
    products = rows_by_tool.get("get_products", [])
    if not products:
        return "Antes de derivar, llama a get_products en este turno para verificar el producto."
    if reason == "retention":
        product = next((p for p in products if p["product_number_last4"] == case.product_last4), None)
        if product is None:
            return f"El cliente no tiene un producto activo terminado en {case.product_last4}."
        return {
            "product_type": product["product_type"],
            "product_last4": case.product_last4,
            "currency": product["currency"],
            "reason": case.reason,
        }

    charge = _verified_charge(case.card_last4, case.transaction_date, case.merchant, case.amount, rows_by_tool)
    if isinstance(charge, str):
        return charge
    return {**charge, "complaint_type": case.complaint_type, "description": case.description}


def _verified_charge(
    card_last4: str, transaction_date: str, merchant: str, amount: float, rows_by_tool: dict[str, list[dict]]
) -> dict | str:
    products = rows_by_tool.get("get_products", [])
    if not products:
        return "Antes de derivar, llama a get_products en este turno para verificar la tarjeta."
    card = next(
        (p for p in products
         if p["product_number_last4"] == card_last4 and p["product_type"].startswith("Tarjeta")),
        None,
    )
    if card is None:
        return f"El cliente no tiene una tarjeta de crédito activa terminada en {card_last4}."
    transactions = rows_by_tool.get("list_transactions", [])
    if not transactions:
        return "Antes de derivar, llama a list_transactions de esa tarjeta en este turno para verificar el cargo."
    charge = next(
        (t for t in transactions
         if t["product_number_last4"] == card_last4
         and str(t["transaction_date"]).startswith(transaction_date)
         and abs(float(t["amount"]) - amount) < 0.01
         # Payments and withdrawals have no merchant.
         and (t["merchant_name"] or "").strip().lower() == merchant.strip().lower()),
        None,
    )
    if charge is None:
        return "Ese cargo no está en los movimientos de esa tarjeta. Pídele al cliente que elija uno de la lista."
    return {
        "card_last4": card_last4,
        "transaction_date": transaction_date,
        "merchant": charge["merchant_name"],
        "amount": float(charge["amount"]),
        "currency": charge["currency"],
        "transaction_status": charge["transaction_status"],
    }


def _verify_case_status(case: "CaseStatusCase", rows_by_tool: dict[str, list[dict]]) -> dict | str:
    if case.complaint_id:
        cases = rows_by_tool.get("get_cases", [])
        if not cases:
            return "Antes de derivar, llama a get_cases en este turno para verificar el reclamo."
        row = next((c for c in cases if c["complaint_id"] == case.complaint_id), None)
        if row is None:
            return f"El cliente no tiene un reclamo {case.complaint_id}. Usa un complaint_id de get_cases."
        return {
            "complaint_id": row["complaint_id"],
            "creation_date": str(row["creation_date"])[:10],
            "subcategory": row["subcategory"],
            "claimed_amount": None if row["claimed_amount"] is None else float(row["claimed_amount"]),
            "currency": row["currency"],
            "status": row["status"],
            "resolution": row["resolution"],
            "need": case.need,
        }
    if not (case.card_last4 and case.transaction_date and case.merchant and case.amount is not None):
        return (
            "Falta identificar el reclamo: pasa el complaint_id de get_cases o, si no está ahí, la "
            "tarjeta, la fecha, el comercio y el monto del cargo."
        )
    charge = _verified_charge(case.card_last4, case.transaction_date, case.merchant, case.amount, rows_by_tool)
    if isinstance(charge, str):
        return charge
    return {**charge, "need": case.need}


async def case_summary(llm, reason: str, verified_data: dict) -> str | None:
    """2-3 lines for the advisor; None if the LLM fails, since the case is handed off anyway."""
    prompt = (
        "Escribe en español, en 2 o 3 líneas y sin saludos, un resumen para el asesor que "
        "recibe este caso de un cliente del banco: qué pide el cliente y qué datos quedaron "
        "verificados. Usa solo estos datos."
    )
    data = json.dumps({"solicitud": _REQUESTS[reason], **verified_data}, ensure_ascii=False)
    try:
        reply = await asyncio.wait_for(
            llm.ainvoke([SystemMessage(content=prompt), HumanMessage(content=data)]),
            timeout=_SUMMARY_TIMEOUT_SECONDS,
        )
    except Exception as exc:  # noqa: BLE001 - the summary is optional
        logger.warning("Case summary failed: %s", type(exc).__name__)
        return None
    text = reply.content if isinstance(reply.content, str) else ""
    return text.strip() or None
