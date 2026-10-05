"""Opt-in local reads of the existing Gold tables; no DDL or free-form SQL."""
from __future__ import annotations

import asyncio
import re
from contextlib import asynccontextmanager

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import (
    Disposition, ExecuteStatementRequestOnWaitTimeout, StatementParameterListItem,
    StatementState,
)

from src.config import settings
from src.tools.bank_sql import GET_CASES, GET_PRODUCTS, LIST_TRANSACTIONS, _sql


def warehouse_query(query: str) -> str:
    # Only the same three customer-scoped queries used by main are accepted.
    if query not in {_sql(t) for t in (GET_PRODUCTS, LIST_TRANSACTIONS, GET_CASES)}:
        raise ValueError("Only the existing customer bank SELECT templates are allowed")
    if not re.fullmatch(r"[a-z_][a-z0-9_]*", settings.uc_catalog):
        raise ValueError("UC_CATALOG must be a plain identifier")
    query = query.replace(f"{settings.bank_ro_schema}.", f"{settings.uc_catalog}.bank_gold.")
    query = re.sub(r"%\((\w+)\)s", r":\1", query)
    return query.replace("::text", "")


class _Cursor:
    def __init__(self, rows):
        self.rows = rows

    async def fetchall(self):
        return self.rows


class DatabricksBankPool:
    """Small compatibility adapter for bank_tools; credentials stay in the SDK."""

    def __init__(self, client=None):
        self._client = client

    @asynccontextmanager
    async def connection(self):
        yield self

    async def execute(self, query: str, params: dict):
        statement = warehouse_query(query)
        if not params.get("customer_id"):
            raise ValueError("A trusted session customer is required")
        if self._client is None:
            self._client = await asyncio.to_thread(WorkspaceClient)
        response = await asyncio.to_thread(
            self._client.statement_execution.execute_statement,
            statement=statement,
            warehouse_id=settings.bank_sql_warehouse_id,
            parameters=[StatementParameterListItem(name=k, value=v, type="STRING") for k, v in params.items()],
            disposition=Disposition.INLINE,
            wait_timeout="10s",
            on_wait_timeout=ExecuteStatementRequestOnWaitTimeout.CANCEL,
            row_limit=100,
        )
        if not response.status or response.status.state != StatementState.SUCCEEDED:
            raise RuntimeError("Read-only bank query did not succeed")
        if not response.manifest or response.manifest.truncated or not response.manifest.schema:
            raise RuntimeError("Incomplete bank query result")
        columns = response.manifest.schema.columns
        data = response.result.data_array if response.result else []
        if columns is None or (
            response.manifest.total_row_count is not None
            and response.manifest.total_row_count != len(data or [])
        ):
            raise RuntimeError("Incomplete bank query result")
        rows = []
        for values in data or []:
            row = {}
            for column, value in zip(columns, values, strict=True):
                if value is not None and column.type_name and column.type_name.value == "BOOLEAN":
                    if value not in ("true", "false"):
                        raise ValueError("Invalid boolean in bank query result")
                    value = value == "true"
                row[column.name] = value
            rows.append(row)
        return _Cursor(rows)
