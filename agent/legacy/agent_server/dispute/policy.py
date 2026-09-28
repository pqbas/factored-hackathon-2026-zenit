"""Dispute eligibility and routing policy (deterministic).

SYNTHETIC POLICY: the thresholds below are team-defined for the Factored
Datathon 2026 and are not a real bank's rules. They live in code, outside any
prompt, so the LLM can neither see nor override them. Each decision returns the
rule ids that fired, which are stored with the case as its explanation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from agent_server.dispute.data import Customer, DisputeCase, Transaction

POLICY_VERSION = "dispute-policy-v1"

DISPUTE_WINDOW_DAYS = 120
AUTO_MAX_AMOUNT_USD = 500.0
FRAUD_SCORE_ESCALATE = 70.0
MAX_OPEN_CASES_FOR_AUTO = 2
DEBIT_TYPES = {"Purchase", "Payment", "Withdrawal", "Transfer"}

# Human-readable rule catalogue (shown to the human agent in the handoff).
RULES = {
    "NE_ALREADY_DISPUTED": "The transaction already has an open dispute case.",
    "NE_NOT_A_DEBIT": "Only debits (purchases, payments, withdrawals, transfers) can be disputed.",
    "NE_DECLINED": "Declined transactions were never charged.",
    "NE_PENDING": "Pending transactions must post before they can be disputed.",
    "NE_REVERSED": "The transaction was already reversed.",
    "NE_TOO_OLD": f"Disputes must be filed within {DISPUTE_WINDOW_DAYS} days of the transaction.",
    "ESC_AMOUNT": f"Amount above {AUTO_MAX_AMOUNT_USD:.0f} USD requires human review.",
    "ESC_NO_USD": "USD amount unavailable; cannot apply the amount threshold automatically.",
    "ESC_FRAUD_SIGNAL": f"Transaction flagged as fraud or fraud_score >= {FRAUD_SCORE_ESCALATE:.0f}.",
    "ESC_OPEN_CASES": f"Customer already has {MAX_OPEN_CASES_FOR_AUTO}+ open cases.",
    "ESC_CUSTOMER_STATUS": "Customer status is not Active.",
    "ESC_CUSTOMER_REQUEST": "Customer asked for a human agent.",
    "AUTO_OK": "All automatic-intake conditions met.",
}


@dataclass
class PolicyDecision:
    outcome: str  # NOT_ELIGIBLE | ESCALATE | AUTO
    rules: list[str] = field(default_factory=list)
    version: str = POLICY_VERSION

    def to_dict(self) -> dict:
        return {"outcome": self.outcome, "rules": self.rules, "version": self.version,
                "explanations": [RULES[r] for r in self.rules]}


def evaluate(tx: Transaction, customer: Customer, existing: DisputeCase | None, as_of: date) -> PolicyDecision:
    if existing is not None:
        return PolicyDecision("NOT_ELIGIBLE", ["NE_ALREADY_DISPUTED"])
    if tx.transaction_type not in DEBIT_TYPES:
        return PolicyDecision("NOT_ELIGIBLE", ["NE_NOT_A_DEBIT"])
    status_rule = {"Declined": "NE_DECLINED", "Pending": "NE_PENDING", "Reversed": "NE_REVERSED"}.get(tx.transaction_status)
    if status_rule:
        return PolicyDecision("NOT_ELIGIBLE", [status_rule])
    if (as_of - tx.transaction_date.date()).days > DISPUTE_WINDOW_DAYS:
        return PolicyDecision("NOT_ELIGIBLE", ["NE_TOO_OLD"])

    escalate = []
    if tx.amount_usd is None:
        escalate.append("ESC_NO_USD")
    elif tx.amount_usd > AUTO_MAX_AMOUNT_USD:
        escalate.append("ESC_AMOUNT")
    if tx.is_fraud or (tx.fraud_score or 0) >= FRAUD_SCORE_ESCALATE:
        escalate.append("ESC_FRAUD_SIGNAL")
    if customer.open_cases >= MAX_OPEN_CASES_FOR_AUTO:
        escalate.append("ESC_OPEN_CASES")
    if customer.customer_status != "Active":
        escalate.append("ESC_CUSTOMER_STATUS")
    if escalate:
        return PolicyDecision("ESCALATE", escalate)
    return PolicyDecision("AUTO", ["AUTO_OK"])
