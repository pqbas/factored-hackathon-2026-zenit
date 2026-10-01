from __future__ import annotations

import hmac

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

TOKEN_HEADER = "x-agent-token"
_OPEN_PATHS = {"/health"}


def token_ok(expected: str, received: str | None) -> bool:
    if not received:
        return False
    return hmac.compare_digest(expected.encode(), received.encode())


def add_token_check(app: FastAPI, token: str | None) -> None:
    """Rejects with 401 every request without the shared token, except the health check.
    The token lives in app.state so the check is off when it is None (local dev, the
    Databricks App). Neither the header nor the token is ever logged."""
    app.state.agent_token = token

    @app.middleware("http")
    async def token_check(request: Request, call_next):
        expected = request.app.state.agent_token
        if expected and request.url.path not in _OPEN_PATHS:
            if not token_ok(expected, request.headers.get(TOKEN_HEADER)):
                return JSONResponse({"detail": "unauthorized"}, status_code=401)
        return await call_next(request)
