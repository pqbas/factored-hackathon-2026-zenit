from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

# Load env vars from .env before importing src.config, which reads them at import time.
load_dotenv(dotenv_path=".env", override=True)

from databricks.sdk import WorkspaceClient  # noqa: E402
from databricks.sdk.service.sql import StatementState  # noqa: E402

from src.config import settings  # noqa: E402


def apply_sql_file(path: str | Path, client: WorkspaceClient | None = None) -> None:
    sql = Path(path).read_text().replace("${catalog}", settings.uc_catalog)
    client = client or WorkspaceClient()

    for statement in _statements(sql):
        print(f"Running:\n{statement}\n")
        _run(client, statement)


def _statements(sql: str) -> list[str]:
    return [s.strip() for s in sql.split(";") if s.strip()]


def _run(client: WorkspaceClient, statement: str, timeout_s: float = 60.0) -> None:
    response = client.statement_execution.execute_statement(
        statement=statement, warehouse_id=_warehouse_id(), wait_timeout="30s",
    )
    deadline = time.monotonic() + timeout_s
    while response.status.state in (StatementState.PENDING, StatementState.RUNNING):
        if time.monotonic() > deadline:
            client.statement_execution.cancel_execution(response.statement_id)
            raise TimeoutError(f"statement exceeded {timeout_s}s:\n{statement}")
        time.sleep(1)
        response = client.statement_execution.get_statement(response.statement_id)
    if response.status.state != StatementState.SUCCEEDED:
        raise RuntimeError(f"statement failed: {response.status.error}\n{statement}")


def _warehouse_id() -> str:
    warehouse_id = os.getenv("DATABRICKS_WAREHOUSE_ID")
    if not warehouse_id:
        raise RuntimeError("DATABRICKS_WAREHOUSE_ID is not set")
    return warehouse_id


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: uv run python scripts/apply_uc.py <path-to-sql-file>", file=sys.stderr)
        sys.exit(1)
    apply_sql_file(sys.argv[1])


if __name__ == "__main__":
    main()
