from __future__ import annotations

import asyncio
import os
import time
from typing import Any, Awaitable, Callable

import httpx
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from src.config import settings
from src.tools import lakebase
from src.tools.bank_sql import GET_PRODUCTS, _sql

MAX_SAMPLES = 30
# A new pool with its token per sample: a few are enough and each one is slow.
MAX_SAMPLES_BY_PROBE = {"lakebase_first": 5}

# A demo customer (demo-mx-1) and made-up rows: the probes never return data.
_CUSTOMER_ID = "CLI-FLEUCGTWGAHL"
_REPLY_PROMPT = (
    "Eres David, asistente de un banco. Responde en español, en una lista breve, el saldo, el límite y el cupo"
    " disponible de cada tarjeta del cliente.\n"
    "Tarjetas: 1111 saldo 1200.50 límite 5000.00 USD; 2222 saldo 310.00 límite 12000.00 USD;"
    " 3333 saldo 45.90 límite 8000.00 USD.\n"
    "Cliente: ¿cuál es el saldo de mis tarjetas?"
)

Probe = Callable[[], Awaitable[None]]


def capped(probe: str, samples: int) -> int:
    return max(1, min(samples, MAX_SAMPLES_BY_PROBE.get(probe, MAX_SAMPLES)))


def _percentile(ordered: list[float], q: float) -> float:
    return ordered[min(len(ordered) - 1, round(q * (len(ordered) - 1)))]


def summarize(probe: str, times: list[float], errors: list[str]) -> dict[str, Any]:
    ordered = sorted(times)
    stats = {"probe": probe, "n": len(ordered), "errors": sorted(set(errors))}
    if ordered:
        stats.update(
            p50=round(_percentile(ordered, 0.5), 3), p95=round(_percentile(ordered, 0.95), 3),
            max=round(ordered[-1], 3), min=round(ordered[0], 3),
        )
    return stats


async def run_probe(probe: str, sample: Probe, samples: int) -> dict[str, Any]:
    times: list[float] = []
    errors: list[str] = []
    for _ in range(capped(probe, samples)):
        start = time.perf_counter()
        try:
            await sample()
        except Exception as exc:
            # Only the type: a message could carry a host, a token or a row.
            errors.append(type(exc).__name__)
            continue
        times.append(time.perf_counter() - start)
    return summarize(probe, times, errors)


async def _tcp_connect(host: str, port: int) -> None:
    _, writer = await asyncio.wait_for(asyncio.open_connection(host, port), timeout=5)
    writer.close()
    await writer.wait_closed()


def _workspace_host() -> str:
    return os.environ["DATABRICKS_HOST"].removeprefix("https://").rstrip("/")


async def _query(pool) -> None:
    async with pool.connection() as conn:
        cursor = await conn.execute(_sql(GET_PRODUCTS), {"customer_id": _CUSTOMER_ID})
        await cursor.fetchall()


async def _first_connection() -> None:
    pool = await asyncio.to_thread(lakebase._create_pool)
    await pool.open()
    try:
        await _query(pool)
    finally:
        await pool.close()


def build_probes(chat_model, jev_client, routes) -> dict[str, Callable[[], Awaitable[Probe]]]:
    """Each entry prepares its probe (opens what must already be open) and returns the
    coroutine function that is timed, so the setup isn't part of any sample."""

    async def connect_workspace() -> Probe:
        host = _workspace_host()
        return lambda: _tcp_connect(host, 443)

    async def connect_lakebase() -> Probe:
        pool = await lakebase.get_pool()
        return lambda: _tcp_connect(pool.host, 5432)

    async def oauth_token() -> Probe:
        url = f"https://{_workspace_host()}/oidc/v1/token"
        auth = (os.environ["DATABRICKS_CLIENT_ID"], os.environ["DATABRICKS_CLIENT_SECRET"])
        client = httpx.AsyncClient(timeout=10)

        async def sample() -> None:
            response = await client.post(url, auth=auth, data={"grant_type": "client_credentials", "scope": "all-apis"})
            response.raise_for_status()

        await sample()  # the connection is open before the first timed sample
        return sample

    async def qwen_min() -> Probe:
        model = chat_model.bind(max_tokens=5)
        await model.ainvoke("di hola")
        return lambda: model.ainvoke("di hola")

    async def qwen_reply() -> Probe:
        model = chat_model.bind(max_tokens=200)
        await chat_model.bind(max_tokens=5).ainvoke("di hola")
        return lambda: model.ainvoke(_REPLY_PROMPT)

    async def lakebase_query() -> Probe:
        pool = await lakebase.get_pool()
        await _query(pool)
        return lambda: _query(pool)

    async def lakebase_first() -> Probe:
        return _first_connection

    async def jev() -> Probe:
        if jev_client is None:
            raise RuntimeError("Jev isn't configured")
        await jev_client.classify("hola", routes)
        return lambda: jev_client.classify("¿cuál es el saldo de mi tarjeta?", routes)

    return {
        "connect_workspace": connect_workspace, "connect_lakebase": connect_lakebase, "oauth_token": oauth_token,
        "qwen_min": qwen_min, "qwen_reply": qwen_reply, "lakebase_query": lakebase_query,
        "lakebase_first": lakebase_first, "jev": jev,
    }


class LatencyRequest(BaseModel):
    probe: str
    samples: int = MAX_SAMPLES


def add_latency_route(app: FastAPI, probes: dict[str, Callable[[], Awaitable[Probe]]]) -> None:
    """Diagnostic only: how long each hop takes from inside the container. It answers
    numbers and error type names, never tokens, rows or texts."""

    @app.post("/diag/latency")
    async def latency(request: LatencyRequest):
        prepare = probes.get(request.probe)
        if prepare is None:
            return JSONResponse({"detail": "unknown probe", "probes": sorted(probes)}, status_code=400)
        try:
            sample = await prepare()
        except Exception as exc:
            return summarize(request.probe, [], [type(exc).__name__])
        return await run_probe(request.probe, sample, request.samples)
