from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.inbound_auth import TOKEN_HEADER, add_token_check

TOKEN = "integration-token-123"


def _client(token):
    app = FastAPI()

    @app.get("/health")
    async def health():
        return {"status": "healthy"}

    @app.post("/invocations")
    async def invocations():
        return {"ok": True}

    add_token_check(app, token)
    return TestClient(app)


def test_health_passes_without_the_header():
    assert _client(TOKEN).get("/health").status_code == 200


def test_other_paths_need_the_exact_token():
    client = _client(TOKEN)
    assert client.post("/invocations").status_code == 401
    assert client.post("/invocations", headers={TOKEN_HEADER: "wrong"}).status_code == 401
    assert client.get("/agent/info").status_code == 401
    assert client.post("/invocations", headers={TOKEN_HEADER: TOKEN}).json() == {"ok": True}


def test_the_401_has_a_fixed_body():
    response = _client(TOKEN).post("/invocations", headers={TOKEN_HEADER: "wrong"}, json={"input": "secret text"})
    assert response.json() == {"detail": "unauthorized"}


def test_no_token_configured_means_no_check():
    assert _client(None).post("/invocations").status_code == 200


def test_the_token_never_reaches_the_log(caplog):
    caplog.set_level(logging.DEBUG)
    client = _client(TOKEN)
    client.post("/invocations", headers={TOKEN_HEADER: TOKEN})
    client.post("/invocations", headers={TOKEN_HEADER: "wrong-token-456"})
    assert TOKEN not in caplog.text and "wrong-token-456" not in caplog.text
