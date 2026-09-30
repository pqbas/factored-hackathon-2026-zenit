from __future__ import annotations

from contextlib import asynccontextmanager


class FakeCursor:
    def __init__(self, rows):
        self._rows = rows

    async def fetchall(self):
        return self._rows


class FakeConnection:
    def __init__(self, pool):
        self._pool = pool

    async def execute(self, query, params=None):
        self._pool.queries.append((query, params))
        if "sim_sessions" in query:
            row = self._pool.sim_sessions.get(params["token"])
            return FakeCursor([row] if row else [])
        if "customer_cases" in query:
            return FakeCursor(self._pool.cases)
        if "customer_transactions" in query:
            return FakeCursor(self._pool.transactions)
        return FakeCursor(self._pool.products)


class FakePool:
    """What AsyncLakebasePool exposes to the tools: connection() as an async context manager
    over a connection whose execute records (query, params) and returns dict rows."""

    def __init__(self, products=(), transactions=(), cases=(), error: Exception | None = None, sim_sessions=None):
        self.products = list(products)
        self.transactions = list(transactions)
        self.cases = list(cases)
        self.error = error
        self.sim_sessions = dict(sim_sessions or {})
        self.queries: list[tuple[str, dict]] = []

    @asynccontextmanager
    async def connection(self):
        if self.error is not None:
            raise self.error
        yield FakeConnection(self)
