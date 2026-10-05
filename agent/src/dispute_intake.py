"""Deterministic charge-review intake; no fraud inference or database writes.

The caller owns the conversation state and supplies an authorized repository.
The local demo supplies synthetic transactions only. Nothing here authorizes a
refund, labels a transaction fraudulent, or persists a banking dispute.
"""
from __future__ import annotations

import hashlib
import json
import re
import secrets
from dataclasses import asdict, dataclass, field
from typing import Protocol

from src.llm.fallback import check_guardrail_rules, mask_sensitive, normalize
from src.prompts.messages import GUARDRAIL_REPLIES


@dataclass(frozen=True)
class Transaction:
    transaction_id: str
    customer_id: str
    merchant_name: str
    amount: str
    currency: str
    transaction_date: str
    product_last4: str

    def public(self) -> dict:
        return {k: v for k, v in asdict(self).items() if k != "customer_id"}


class TransactionRepository(Protocol):
    def list_owned(self, customer_id: str) -> list[Transaction]: ...
    def get_owned(self, customer_id: str, transaction_id: str) -> Transaction | None: ...


@dataclass
class IntakeState:
    stage: str = "idle"
    offered_ids: set[str] = field(default_factory=set)
    offered: list[dict] = field(default_factory=list)
    selected: dict | None = None
    confirmation_id: str | None = None
    fingerprint: str | None = None
    customer_statement: str | None = None


@dataclass(frozen=True)
class IntakeResult:
    text: str
    choices: list[dict] = field(default_factory=list)
    confirmation_id: str | None = None
    handoff: dict | None = None
    blocked: bool = False


_REPORT = re.compile(r"no reconozco|desconozco|no autorice|no hice|nao reconheco|nao autorizei|nao fiz")
_OTHER_CUSTOMER = re.compile(r"otro cliente|otra persona|de otra cuenta|outro cliente|outra pessoa|other customer")

_COPY = {
    "start": {
        "es": "Puedo ayudarte a solicitar una revisión de un cargo que no reconoces. Cuéntame qué ocurrió.",
        "pt": "Posso ajudar a solicitar a revisão de uma cobrança que você não reconhece. Conte o que aconteceu.",
    },
    "choose": {
        "es": "Estos son tus movimientos disponibles. Selecciona el cargo que no reconoces.",
        "pt": "Estas são suas movimentações disponíveis. Selecione a cobrança que não reconhece.",
    },
    "empty": {
        "es": "No encontré movimientos disponibles. No he registrado un reclamo; necesitamos revisar la información con un asesor.",
        "pt": "Não encontrei movimentações disponíveis. Não registrei uma reclamação; precisamos revisar as informações com um atendente.",
    },
    "missing": {
        "es": "No pude verificar ese movimiento en tu cuenta. Selecciona uno de los movimientos disponibles.",
        "pt": "Não consegui verificar essa movimentação na sua conta. Selecione uma das movimentações disponíveis.",
    },
    "changed": {
        "es": "Los datos del movimiento cambiaron. Vuelve a seleccionarlo y confirmarlo antes de solicitar revisión.",
        "pt": "Os dados da movimentação mudaram. Selecione e confirme novamente antes de solicitar a revisão.",
    },
    "confirmation": {
        "es": "Confirma que no reconoces este cargo y que quieres enviarlo a revisión. Todavía no se ha enviado.",
        "pt": "Confirme que não reconhece esta cobrança e deseja enviá-la para revisão. Ela ainda não foi enviada.",
    },
    "cancel": {
        "es": "Cancelé esta solicitud de revisión. No se ha enviado a un asesor.",
        "pt": "Cancelei esta solicitação de revisão. Ela não foi enviada a um atendente.",
    },
    "requested": {
        "es": "Preparé la solicitud de revisión del cargo. El sistema debe confirmar su envío.",
        "pt": "Preparei a solicitação de revisão da cobrança. O sistema precisa confirmar o envio.",
    },
}


def _fingerprint(transaction: dict) -> str:
    return hashlib.sha256(json.dumps(transaction, sort_keys=True).encode()).hexdigest()


def advance_intake(
    state: IntakeState,
    repository: TransactionRepository,
    customer_id: str,
    *,
    language: str = "es",
    message: str = "",
    action: str = "message",
    transaction_id: str | None = None,
    confirmation_id: str | None = None,
) -> IntakeResult:
    """Evaluate a turn against caller-owned state and recheck ownership on confirm."""
    lang = language if language in ("es", "pt") else "es"
    copy = lambda key: _COPY[key][lang]
    guardrail = check_guardrail_rules(message)
    if guardrail:
        return IntakeResult(GUARDRAIL_REPLIES[guardrail[0]][lang], blocked=True)
    if _OTHER_CUSTOMER.search(normalize(message)):
        return IntakeResult(GUARDRAIL_REPLIES["THIRD_PARTY_DATA"][lang], blocked=True)
    if action == "cancel":
        state.stage = "idle"
        state.offered_ids.clear()
        state.offered.clear()
        state.selected = state.confirmation_id = state.fingerprint = state.customer_statement = None
        return IntakeResult(copy("cancel"))
    if action == "select":
        if state.stage not in ("choose", "confirm") or transaction_id not in state.offered_ids:
            return IntakeResult(copy("missing"))
        tx = repository.get_owned(customer_id, transaction_id)
        if tx is None or tx.customer_id != customer_id:
            return IntakeResult(copy("missing"))
        state.selected = tx.public()
        state.fingerprint = _fingerprint(state.selected)
        state.confirmation_id = secrets.token_urlsafe(24)
        state.stage = "confirm"
        return IntakeResult(copy("confirmation"), [state.selected], state.confirmation_id)
    if action == "confirm":
        if (
            state.stage != "confirm" or state.selected is None
            or not confirmation_id or confirmation_id != state.confirmation_id
            or transaction_id != state.selected["transaction_id"]
        ):
            return IntakeResult(copy("confirmation"))
        tx = repository.get_owned(customer_id, transaction_id)
        if tx is None or tx.customer_id != customer_id or _fingerprint(tx.public()) != state.fingerprint:
            state.stage = "choose"
            state.selected = state.confirmation_id = state.fingerprint = None
            return IntakeResult(copy("changed"))
        handoff = {
            "reason": "policy_escalation",
            "summary": (
                "Customer reports the selected charge as unrecognized and explicitly requests review. "
                "The transaction was found in the session customer's permitted records. Fraud is not established."
            ),
            "facts": {
                "condition": "customer_report_confirmed",
                "use_case": "COMPLAINT", "intent": "COMPLAINT", "language": lang,
                "case_id": None,
                "tools_called": ["list_owned_transactions", "get_owned_transaction"],
                "verified_data": state.selected,
                "customer_statement": state.customer_statement,
                "fraud_assessment": {"status": "not_validated", "risk_score": None, "decision_use": False},
                "unresolved_questions": ["Was the charge authorized by the customer?"],
            },
        }
        # The caller saves the handoff before acknowledging success. It must
        # discard this mutated state if persistence fails.
        state.stage = "review"
        state.confirmation_id = None
        return IntakeResult(copy("requested"), handoff=handoff)
    if state.stage in ("choose", "confirm"):
        # Free text is never treated as transaction selection or confirmation.
        return IntakeResult(copy("confirmation") if state.stage == "confirm" else copy("choose"))
    if not _REPORT.search(normalize(message)):
        return IntakeResult(copy("start"))
    transactions = [tx for tx in repository.list_owned(customer_id) if tx.customer_id == customer_id]
    if not transactions:
        return IntakeResult(copy("empty"))
    state.offered_ids = {tx.transaction_id for tx in transactions}
    state.offered = [tx.public() for tx in transactions]
    state.customer_statement = mask_sensitive(message)
    state.stage = "choose"
    return IntakeResult(copy("choose"), state.offered)


def handoff_outputs(thread_id: str, language: str, result: IntakeResult) -> dict:
    """Same custom_outputs shape consumed by the existing backend provider."""
    return {
        "thread_id": thread_id, "use_case": "COMPLAINT", "intent": "COMPLAINT",
        "language": language, "blocked": result.blocked, "handoff": result.handoff,
    }
