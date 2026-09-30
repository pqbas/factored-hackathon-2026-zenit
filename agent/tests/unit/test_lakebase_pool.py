from __future__ import annotations

import asyncio

from src.tools import lakebase


class FakeConnectionPool:
    def __init__(self):
        self.kwargs = {}


class FakeAsyncLakebasePool:
    instances: list["FakeAsyncLakebasePool"] = []

    def __init__(self, **kwargs):
        self.init_kwargs = kwargs
        self.pool = FakeConnectionPool()
        self.opened = 0
        FakeAsyncLakebasePool.instances.append(self)

    async def open(self):
        self.opened += 1


def _patch(monkeypatch):
    FakeAsyncLakebasePool.instances = []
    monkeypatch.setattr(lakebase, "AsyncLakebasePool", FakeAsyncLakebasePool)
    monkeypatch.setattr(lakebase, "_pool", None)
    monkeypatch.setattr(lakebase, "_lock", None)


def test_the_pool_is_created_with_short_timeouts_and_a_small_size(monkeypatch):
    _patch(monkeypatch)
    pool = asyncio.run(lakebase.get_pool())

    kwargs = pool.init_kwargs
    assert kwargs["instance_name"] == lakebase.settings.lakebase_instance
    assert kwargs["max_size"] == 4
    assert kwargs["timeout"] == 5
    assert pool.pool.kwargs["connect_timeout"] == 5
    assert pool.pool.kwargs["dbname"] == lakebase.settings.lakebase_database


def test_every_connection_gets_a_5s_statement_timeout(monkeypatch):
    _patch(monkeypatch)
    pool = asyncio.run(lakebase.get_pool())
    executed = []

    class Conn:
        async def execute(self, query, params=None):
            executed.append((query, params))

    asyncio.run(pool.init_kwargs["configure"](Conn()))
    assert executed == [("SELECT set_config('statement_timeout', %s, false)", ("5000",))]


def test_the_pool_opens_once_on_first_use(monkeypatch):
    _patch(monkeypatch)

    async def twice():
        return await lakebase.get_pool(), await lakebase.get_pool()

    first, second = asyncio.run(twice())
    assert first is second
    assert len(FakeAsyncLakebasePool.instances) == 1 and first.opened == 1


def test_nothing_is_created_until_a_query_runs(monkeypatch):
    _patch(monkeypatch)
    lakebase.LazyLakebasePool()
    assert FakeAsyncLakebasePool.instances == []
