from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.diag import add_latency_route
from src.inbound_auth import TOKEN_HEADER, add_token_check

TOKEN = "diag-token"


def _client(probes):
    app = FastAPI()
    add_token_check(app, TOKEN)
    add_latency_route(app, probes)
    return TestClient(app)


async def _fast():
    async def sample():
        return None
    return sample


async def _broken_setup():
    raise RuntimeError("host=db.internal password=hunter2")


def test_the_route_answers_only_the_stats_of_the_probe():
    response = _client({"fast": _fast}).post(
        "/diag/latency", headers={TOKEN_HEADER: TOKEN}, json={"probe": "fast", "samples": 3})
    body = response.json()
    assert response.status_code == 200
    assert set(body) == {"probe", "n", "errors", "times", "p50", "p95", "max", "min"}
    assert body["n"] == 3 and body["errors"] == []


def test_an_unknown_probe_is_400():
    response = _client({"fast": _fast}).post("/diag/latency", headers={TOKEN_HEADER: TOKEN}, json={"probe": "nope"})
    assert response.status_code == 400


def test_a_failing_setup_answers_the_error_type_only():
    response = _client({"bad": _broken_setup}).post("/diag/latency", headers={TOKEN_HEADER: TOKEN}, json={"probe": "bad"})
    assert response.json() == {"probe": "bad", "n": 0, "errors": ["RuntimeError"], "times": []}
    assert "hunter2" not in response.text


def test_the_route_needs_the_token():
    assert _client({"fast": _fast}).post("/diag/latency", json={"probe": "fast"}).status_code == 401
