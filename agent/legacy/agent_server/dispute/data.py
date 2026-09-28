"""Data access for the dispute workflow.

Every read is scoped to the session's customer_id inside the query itself, so a
prompt can never widen what the agent sees. Two backends share one interface:

- ``WarehouseBankData``: Unity Catalog gold tables through a SQL warehouse
  (parameterized statements, bounded retries). Used in Databricks.
- ``InMemoryBankData``: tests and local development without Databricks; can be
  loaded from the dummy CSVs in ``data/dummy_output``.
"""

from __future__ import annotations

import csv
import json
import logging
import time
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Protocol

logger = logging.getLogger(__name__)


class DataUnavailableError(RuntimeError):
    """A data tool failed after its bounded retries."""


@dataclass
class Customer:
    customer_id: str
    first_name: str
    country: str
    segment: str
    customer_status: str
    open_cases: int
    as_of_date: date


@dataclass
class Transaction:
    transaction_id: str
    customer_id: str
    product_id: str
    product_type: str | None
    transaction_date: datetime
    transaction_type: str
    amount: float
    currency: str
    amount_usd: float | None
    merchant_name: str | None
    channel: str | None
    transaction_city: str | None
    transaction_status: str
    is_fraud: bool
    fraud_score: float | None

    def to_dict(self) -> dict:
        d = asdict(self)
        d["transaction_date"] = self.transaction_date.isoformat(sep=" ")
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Transaction":
        return cls(**{**d, "transaction_date": datetime.fromisoformat(d["transaction_date"])})


@dataclass
class DisputeCase:
    case_id: str
    customer_id: str
    transaction_id: str | None
    created_at: datetime
    status: str  # Open | Escalated
    route: str  # AUTO | HUMAN
    amount: float | None
    currency: str | None
    amount_usd: float | None
    customer_reason: str
    policy_rules: list[str] = field(default_factory=list)
    handoff: dict | None = None
    language: str = "es"
    thread_id: str | None = None

    def to_dict(self) -> dict:
        d = asdict(self)
        d["created_at"] = self.created_at.isoformat(sep=" ")
        return d


class BankData(Protocol):
    def get_customer(self, customer_id: str) -> Customer | None: ...

    def list_transactions(self, customer_id: str, date_from: date, date_to: date, limit: int = 300) -> list[Transaction]: ...

    def find_open_dispute(self, customer_id: str, transaction_id: str) -> DisputeCase | None: ...

    def create_dispute(self, case: DisputeCase) -> None: ...

    def get_dispute(self, customer_id: str, case_id: str) -> DisputeCase | None: ...


# ---------------------------------------------------------------------------
# In-memory backend
# ---------------------------------------------------------------------------


class InMemoryBankData:
    def __init__(self, customers: list[Customer], transactions: list[Transaction]):
        self.customers = {c.customer_id: c for c in customers}
        self.transactions = transactions
        self.cases: dict[str, DisputeCase] = {}
        self.fail_reads = 0  # number of upcoming reads that raise (tool-failure tests)
        self.fail_writes = 0

    def _maybe_fail(self, kind: str) -> None:
        attr = f"fail_{kind}"
        if getattr(self, attr) > 0:
            setattr(self, attr, getattr(self, attr) - 1)
            raise DataUnavailableError(f"simulated {kind} failure")

    def get_customer(self, customer_id: str) -> Customer | None:
        self._maybe_fail("reads")
        return self.customers.get(customer_id)

    def list_transactions(self, customer_id: str, date_from: date, date_to: date, limit: int = 300) -> list[Transaction]:
        self._maybe_fail("reads")
        rows = [
            t for t in self.transactions
            if t.customer_id == customer_id and date_from <= t.transaction_date.date() <= date_to
        ]
        return sorted(rows, key=lambda t: t.transaction_date, reverse=True)[:limit]

    def find_open_dispute(self, customer_id: str, transaction_id: str) -> DisputeCase | None:
        self._maybe_fail("reads")
        return next(
            (c for c in self.cases.values()
             if c.customer_id == customer_id and c.transaction_id == transaction_id and c.status in ("Open", "Escalated")),
            None,
        )

    def create_dispute(self, case: DisputeCase) -> None:
        self._maybe_fail("writes")
        self.cases[case.case_id] = case

    def get_dispute(self, customer_id: str, case_id: str) -> DisputeCase | None:
        self._maybe_fail("reads")
        case = self.cases.get(case_id)
        return case if case and case.customer_id == customer_id else None

    @classmethod
    def from_csv_dir(cls, path: str | Path) -> "InMemoryBankData":
        """Load the dummy CSVs produced by data/generate_dummy_data.py (first row per PK wins)."""
        path = Path(path)

        def rows(table: str):
            with (path / table / f"{table}.csv").open(encoding="utf-8") as f:
                yield from csv.DictReader(f)

        def num(v: str | None) -> float | None:
            return float(v) if v not in (None, "") else None

        products = {r["product_id"]: r["product_type"] for r in rows("products")}
        open_cases: dict[str, int] = {}
        for r in rows("complaints"):
            if r["status"] in ("Open", "In Process", "Escalated"):
                open_cases[r["customer_id"]] = open_cases.get(r["customer_id"], 0) + 1
        seen: set[str] = set()
        txs = []
        for r in rows("transactions"):
            if r["transaction_id"] in seen or not r["transaction_date"]:
                continue
            seen.add(r["transaction_id"])
            txs.append(Transaction(
                transaction_id=r["transaction_id"], customer_id=r["customer_id"], product_id=r["product_id"],
                product_type=products.get(r["product_id"]), transaction_date=datetime.fromisoformat(r["transaction_date"]),
                transaction_type=r["transaction_type"], amount=float(r["amount"]), currency=r["currency"],
                amount_usd=num(r["amount_usd"]), merchant_name=r["merchant_name"] or None, channel=r["channel"] or None,
                transaction_city=r["transaction_city"] or None, transaction_status=r["transaction_status"],
                is_fraud=r["is_fraud"] == "true", fraud_score=num(r["fraud_score"]),
            ))
        as_of = max(t.transaction_date for t in txs).date()
        customers = {}
        for r in rows("customers"):
            customers.setdefault(r["customer_id"], Customer(
                customer_id=r["customer_id"], first_name=r["first_name"], country=r["country"], segment=r["segment"],
                customer_status=r["customer_status"], open_cases=open_cases.get(r["customer_id"], 0), as_of_date=as_of,
            ))
        return cls(list(customers.values()), txs)


# ---------------------------------------------------------------------------
# SQL warehouse backend
# ---------------------------------------------------------------------------


class WarehouseBankData:
    """Reads bank_gold.* and writes bank_ops.dispute_cases through a SQL warehouse."""

    def __init__(self, warehouse_id: str, catalog: str = "workspace", client=None,
                 max_attempts: int = 3, timeout_s: float = 60.0):
        from databricks.sdk import WorkspaceClient

        self.w = client or WorkspaceClient()
        self.warehouse_id = warehouse_id
        self.catalog = catalog
        self.max_attempts = max_attempts
        self.timeout_s = timeout_s

    # -- plumbing -------------------------------------------------------------

    def _run(self, sql: str, params: dict[str, object] | None = None) -> list[dict]:
        from databricks.sdk.service.sql import StatementParameterListItem, StatementState

        items = [StatementParameterListItem(name=k, value=None if v is None else str(v)) for k, v in (params or {}).items()]
        last_exc: Exception | None = None
        for attempt in range(1, self.max_attempts + 1):
            try:
                resp = self.w.statement_execution.execute_statement(
                    statement=sql, warehouse_id=self.warehouse_id, parameters=items, wait_timeout="30s",
                )
                deadline = time.monotonic() + self.timeout_s
                while resp.status.state in (StatementState.PENDING, StatementState.RUNNING):
                    if time.monotonic() > deadline:
                        self.w.statement_execution.cancel_execution(resp.statement_id)
                        raise TimeoutError(f"statement exceeded {self.timeout_s}s")
                    time.sleep(1)
                    resp = self.w.statement_execution.get_statement(resp.statement_id)
                if resp.status.state != StatementState.SUCCEEDED:
                    raise RuntimeError(f"statement {resp.status.state}: {resp.status.error}")
                cols = [c.name for c in resp.manifest.schema.columns] if resp.manifest else []
                data = (resp.result.data_array if resp.result else None) or []
                return [dict(zip(cols, row)) for row in data]
            except Exception as exc:  # noqa: BLE001 - every failure is retried, then surfaced
                last_exc = exc
                logger.warning("SQL attempt %d/%d failed: %s", attempt, self.max_attempts, exc)
                if attempt < self.max_attempts:
                    time.sleep(0.5 * 2 ** (attempt - 1))
        raise DataUnavailableError(str(last_exc)) from last_exc

    def _t(self, name: str) -> str:
        return f"{self.catalog}.{name}"

    # -- reads ----------------------------------------------------------------

    def get_customer(self, customer_id: str) -> Customer | None:
        rows = self._run(
            f"SELECT customer_id, first_name, country, segment, customer_status, open_cases, as_of_date "
            f"FROM {self._t('bank_gold.customer_360')} WHERE customer_id = :cid",
            {"cid": customer_id},
        )
        if not rows:
            return None
        r = rows[0]
        return Customer(r["customer_id"], r["first_name"], r["country"], r["segment"], r["customer_status"],
                        int(r["open_cases"] or 0), date.fromisoformat(r["as_of_date"]))

    def list_transactions(self, customer_id: str, date_from: date, date_to: date, limit: int = 300) -> list[Transaction]:
        rows = self._run(
            f"SELECT transaction_id, customer_id, product_id, product_type, transaction_date, transaction_type, amount, "
            f"currency, amount_usd, merchant_name, channel, transaction_city, transaction_status, is_fraud, fraud_score "
            f"FROM {self._t('bank_gold.customer_transactions')} "
            f"WHERE customer_id = :cid AND transaction_date >= :dfrom AND transaction_date < :dto "
            f"ORDER BY transaction_date DESC LIMIT {int(limit)}",
            {"cid": customer_id, "dfrom": date_from.isoformat(), "dto": (date_to + timedelta(days=1)).isoformat()},
        )
        return [self._tx(r) for r in rows]

    @staticmethod
    def _tx(r: dict) -> Transaction:
        f = lambda v: float(v) if v is not None else None  # noqa: E731
        return Transaction(
            transaction_id=r["transaction_id"], customer_id=r["customer_id"], product_id=r["product_id"],
            product_type=r["product_type"], transaction_date=datetime.fromisoformat(r["transaction_date"].replace("T", " ").rstrip("Z")),
            transaction_type=r["transaction_type"], amount=float(r["amount"]), currency=r["currency"], amount_usd=f(r["amount_usd"]),
            merchant_name=r["merchant_name"], channel=r["channel"], transaction_city=r["transaction_city"],
            transaction_status=r["transaction_status"], is_fraud=str(r["is_fraud"]).lower() == "true", fraud_score=f(r["fraud_score"]),
        )

    def _case(self, r: dict) -> DisputeCase:
        f = lambda v: float(v) if v is not None else None  # noqa: E731
        return DisputeCase(
            case_id=r["case_id"], customer_id=r["customer_id"], transaction_id=r["transaction_id"],
            created_at=datetime.fromisoformat(r["created_at"].replace("T", " ").rstrip("Z")), status=r["status"], route=r["route"],
            amount=f(r["amount"]), currency=r["currency"], amount_usd=f(r["amount_usd"]), customer_reason=r["customer_reason"],
            policy_rules=json.loads(r["policy_rules"] or "[]"), handoff=json.loads(r["handoff_json"]) if r["handoff_json"] else None,
            language=r["language"], thread_id=r["thread_id"],
        )

    def find_open_dispute(self, customer_id: str, transaction_id: str) -> DisputeCase | None:
        rows = self._run(
            f"SELECT * FROM {self._t('bank_ops.dispute_cases')} WHERE customer_id = :cid AND transaction_id = :tid "
            f"AND status IN ('Open', 'Escalated') ORDER BY created_at DESC LIMIT 1",
            {"cid": customer_id, "tid": transaction_id},
        )
        return self._case(rows[0]) if rows else None

    def get_dispute(self, customer_id: str, case_id: str) -> DisputeCase | None:
        rows = self._run(
            f"SELECT * FROM {self._t('bank_ops.dispute_cases')} WHERE customer_id = :cid AND case_id = :case",
            {"cid": customer_id, "case": case_id},
        )
        return self._case(rows[0]) if rows else None

    # -- writes ---------------------------------------------------------------

    def create_dispute(self, case: DisputeCase) -> None:
        self._run(
            # MERGE on case_id makes the write idempotent, so a retried statement never duplicates a case.
            f"MERGE INTO {self._t('bank_ops.dispute_cases')} t USING (SELECT :case_id AS case_id, :customer_id AS customer_id, "
            f":transaction_id AS transaction_id, CAST(:created_at AS TIMESTAMP) AS created_at, :status AS status, :route AS route, "
            f"CAST(:amount AS DECIMAL(15,2)) AS amount, :currency AS currency, CAST(:amount_usd AS DECIMAL(15,2)) AS amount_usd, "
            f":customer_reason AS customer_reason, :policy_rules AS policy_rules, :handoff_json AS handoff_json, "
            f":language AS language, :thread_id AS thread_id) s ON t.case_id = s.case_id WHEN NOT MATCHED THEN INSERT *",
            {
                "case_id": case.case_id, "customer_id": case.customer_id, "transaction_id": case.transaction_id,
                "created_at": case.created_at.isoformat(sep=" "), "status": case.status, "route": case.route,
                "amount": case.amount, "currency": case.currency, "amount_usd": case.amount_usd,
                "customer_reason": case.customer_reason, "policy_rules": json.dumps(case.policy_rules),
                "handoff_json": json.dumps(case.handoff, ensure_ascii=False) if case.handoff else None,
                "language": case.language, "thread_id": case.thread_id,
            },
        )
