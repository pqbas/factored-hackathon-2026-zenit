"""Loopback-only, synthetic customer/advisor demo with no database or LLM calls."""
from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from src.dispute_intake import IntakeState, Transaction, advance_intake, handoff_outputs
from src.llm.fallback import mask_sensitive, normalize


# Fictional test identities, deliberately unrelated to organizer customer IDs.
SESSIONS = {
    "local-client-es": ("fixture-customer-a", "es"),
    "local-client-pt": ("fixture-customer-b", "pt"),
}
ADVISOR_SESSION = "local-advisor"
FIXTURES = (
    Transaction("DEMO-TX-001", "fixture-customer-a", "Mercado Central", "120.00", "USD", "2026-09-25T14:30:00Z", "1042"),
    Transaction("DEMO-TX-002", "fixture-customer-a", "Café del Parque", "18.50", "USD", "2026-09-24T09:15:00Z", "1042"),
    Transaction("DEMO-TX-003", "fixture-customer-b", "Livraria do Bairro", "75.00", "USD", "2026-09-25T11:00:00Z", "2086"),
)


class FixtureRepository:
    def list_owned(self, customer_id):
        return [tx for tx in FIXTURES if tx.customer_id == customer_id]

    def get_owned(self, customer_id, transaction_id):
        return next((tx for tx in FIXTURES if tx.customer_id == customer_id and tx.transaction_id == transaction_id), None)


class Turn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(default="", max_length=2000)
    action: Literal["message", "select", "confirm", "cancel"] = "message"
    transaction_id: str | None = Field(default=None, max_length=100)
    confirmation_id: str | None = Field(default=None, max_length=100)
    request_id: str = Field(min_length=1, max_length=100)


class AdvisorReply(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=2000)
    request_id: str = Field(min_length=1, max_length=100)


class ProxyRequest(BaseModel):
    """Responses-style envelope for exercising the existing agent API contract."""
    input: list[dict] = Field(min_length=1, max_length=50)
    custom_inputs: dict = Field(default_factory=dict)
    stream: bool = False


@dataclass
class Conversation:
    id: str
    customer_id: str
    language: str
    intake: IntakeState = field(default_factory=IntakeState)
    handled_by: str = "ai_agent"
    handoff: dict | None = None
    messages: list[dict] = field(default_factory=list)
    replies: dict = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class MemoryLedger:
    """One-process demo adapter. A handoff is acknowledged only after commit."""
    def __init__(self):
        self.conversations: dict[str, Conversation] = {}
        self.fail_next_commit = False  # Test-only fault injection, no public endpoint.

    def commit(self, original: Conversation, draft: Conversation):
        if self.fail_next_commit:
            self.fail_next_commit = False
            raise RuntimeError("Simulated local persistence failure")
        original.intake = draft.intake
        original.handled_by = draft.handled_by
        original.handoff = draft.handoff
        original.messages = draft.messages
        original.replies = draft.replies


def _row(sender: str, text: str) -> dict:
    return {"id": str(uuid.uuid4()), "sender_type": sender, "text": mask_sensitive(text),
            "created_at": datetime.now(timezone.utc).isoformat()}


def _draft(c: Conversation) -> Conversation:
    # Locks are not copied, and the original object remains stable for waiters.
    return Conversation(c.id, c.customer_id, c.language, copy.deepcopy(c.intake),
                        c.handled_by, copy.deepcopy(c.handoff), copy.deepcopy(c.messages), copy.deepcopy(c.replies))


def create_app(repository=None, ledger=None) -> FastAPI:
    app = FastAPI(title="Local dispute integration demo")
    repository = repository if repository is not None else FixtureRepository()
    ledger = ledger if ledger is not None else MemoryLedger()
    app.state.ledger = ledger
    app.state.repository = repository

    def customer(token):
        if token == "local-expired":
            raise HTTPException(401, "Demo session expired")
        if token not in SESSIONS:
            raise HTTPException(401, "A valid local demo customer session is required")
        return SESSIONS[token]

    def advisor(token):
        if token != ADVISOR_SESSION:
            raise HTTPException(403, "A local demo advisor session is required")

    def find(conversation_id):
        c = ledger.conversations.get(conversation_id)
        if c is None:
            raise HTTPException(404, "Conversation not found")
        return c

    def owned(conversation_id, token):
        customer_id, _ = customer(token)
        c = find(conversation_id)
        if c.customer_id != customer_id:
            raise HTTPException(404, "Conversation not found")
        return c

    def view(c):
        return {"id": c.id, "language": c.language, "handledBy": c.handled_by,
                "stage": c.intake.stage, "messages": c.messages,
                "choices": c.intake.offered if c.handled_by == "ai_agent" else [],
                "selected": c.intake.selected, "confirmation_id": c.intake.confirmation_id,
                "handoff": c.handoff, "fixture": True}

    def commit(c, draft):
        try:
            ledger.commit(c, draft)
        except RuntimeError:
            raise HTTPException(503, "Review request was not saved; retry with the same request ID") from None

    @app.get("/", include_in_schema=False)
    def page():
        return FileResponse(Path(__file__).parent / "demo_ui" / "index.html")

    @app.get("/health")
    def health():
        return {"status": "ok", "mode": "synthetic_local_demo", "storage": "process_memory",
                "fraud_model": "not_validated", "remote_calls": False}

    @app.post("/api/conversations")
    def new_conversation(x_demo_session: str | None = Header(default=None)):
        customer_id, language = customer(x_demo_session)
        if len(ledger.conversations) >= 100:
            raise HTTPException(429, "Demo conversation limit reached; restart to clear memory")
        c = Conversation(str(uuid.uuid4()), customer_id, language)
        ledger.conversations[c.id] = c
        return view(c)

    @app.get("/api/conversations/{conversation_id}")
    def conversation(conversation_id: str, x_demo_session: str | None = Header(default=None)):
        return view(owned(conversation_id, x_demo_session))

    @app.post("/api/conversations/{conversation_id}/turn")
    async def turn(conversation_id: str, body: Turn, x_demo_session: str | None = Header(default=None)):
        c = owned(conversation_id, x_demo_session)
        digest = hashlib.sha256(body.model_dump_json().encode()).hexdigest()
        async with c.lock:
            key = "customer:" + body.request_id
            cached = c.replies.get(key)
            if cached:
                if cached[0] != digest:
                    raise HTTPException(409, "Request ID was already used with different input")
                return cached[1]
            if len(c.messages) >= 200:
                raise HTTPException(429, "Demo conversation message limit reached")
            draft = _draft(c)
            if c.handled_by != "ai_agent":
                if body.action != "message":
                    raise HTTPException(409, "This conversation is already awaiting human review")
                if not body.message.strip():
                    raise HTTPException(422, "A customer message cannot be blank")
                draft.messages.append(_row("customer", body.message))
                payload = {"text": None, "choices": [], "confirmation_id": None,
                           "custom_outputs": None, "conversation": view(draft)}
            else:
                try:
                    result = advance_intake(draft.intake, repository, c.customer_id,
                                            language=c.language, message=body.message,
                                            action=body.action, transaction_id=body.transaction_id,
                                            confirmation_id=body.confirmation_id)
                except Exception:
                    raise HTTPException(503, "Transaction lookup failed; no review request was saved") from None
                if body.message.strip():
                    draft.messages.append(_row("customer", body.message))
                text = result.text
                if result.handoff:
                    draft.handoff = result.handoff
                    draft.handled_by = "human_queue"
                    text = ("Tu solicitud quedó en la cola local de revisión. Un asesor puede continuar en este chat."
                            if c.language == "es" else "Sua solicitação está na fila local de revisão. Um atendente pode continuar neste chat.")
                    draft.messages.append(_row("system", "Revisión solicitada" if c.language == "es" else "Revisão solicitada"))
                draft.messages.append(_row("ai_agent", text))
                payload = {"text": text, "choices": result.choices, "confirmation_id": result.confirmation_id,
                           "custom_outputs": handoff_outputs(c.id, c.language, result), "conversation": view(draft)}
            draft.replies[key] = (digest, payload)
            commit(c, draft)
            return payload

    @app.get("/api/advisor/queue")
    def queue(x_demo_advisor: str | None = Header(default=None)):
        advisor(x_demo_advisor)
        return [view(c) for c in ledger.conversations.values() if c.handoff]

    @app.post("/invocations")
    async def invocations(body: ProxyRequest):
        token = body.custom_inputs.get("session_token")
        customer_id, language = customer(token)
        cid = body.custom_inputs.get("thread_id") or str(uuid.uuid4())
        if not isinstance(cid, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", cid):
            raise HTTPException(422, "Invalid thread ID")
        users = [message for message in body.input if message.get("role") == "user"]
        if not users:
            raise HTTPException(422, "At least one customer message is required")
        text = users[-1].get("content", "")
        if isinstance(text, list):
            text = " ".join(part.get("text", "") for part in text if isinstance(part, dict) and isinstance(part.get("text"), str))
        if not isinstance(text, str) or len(text) > 2000:
            raise HTTPException(422, "Customer text must be at most 2000 characters")
        if cid not in ledger.conversations:
            if len(ledger.conversations) >= 100:
                raise HTTPException(429, "Demo conversation limit reached")
            ledger.conversations[cid] = Conversation(cid, customer_id, language)
        c = owned(cid, token)
        action = "message"
        transaction_id = confirmation_id = None
        select = re.fullmatch(r"(?:seleccionar|selecionar) (demo-tx-\d+)", normalize(text.strip()))
        confirm = re.fullmatch(r"(?:confirmo la revision de|confirmo a revisao de) (demo-tx-\d+)", normalize(text.strip()))
        if select:
            action, transaction_id = "select", select[1].upper()
        elif confirm:
            action, transaction_id = "confirm", confirm[1].upper()
            confirmation_id = c.intake.confirmation_id
        elif normalize(text.strip()) == "cancelar":
            action = "cancel"
        request_id = hashlib.sha256(json.dumps(body.input, sort_keys=True).encode()).hexdigest()
        cached = c.replies.get("customer:" + request_id)
        if cached:
            # Identical Responses input is a retry even after the server has
            # consumed the confirmation token. Input history/message IDs make
            # separate turns distinct when their text happens to be identical.
            payload = cached[1]
        else:
            payload = await turn(cid, Turn(message=text, action=action, transaction_id=transaction_id,
                                           confirmation_id=confirmation_id, request_id=request_id), token)
        reply = payload["text"] or ("Tu mensaje quedó para el asesor." if language == "es" else "Sua mensagem ficou para o atendente.")
        if payload["choices"] and action == "message":
            reply += "\n\n" + "\n".join(
                f"{tx['transaction_id']}: {tx['merchant_name']} · {tx['amount']} {tx['currency']} · {tx['transaction_date'][:10]}"
                for tx in payload["choices"])
            reply += "\n" + ("Escribe Seleccionar seguido del identificador del cargo." if language == "es" else "Escreva Selecionar seguido do identificador da cobrança.")
        if payload["confirmation_id"]:
            tx = payload["conversation"]["selected"]
            reply += f"\n{tx['merchant_name']} · {tx['amount']} {tx['currency']} · {tx['transaction_date'][:10]}"
            reply += "\n" + (("Para enviarlo escribe: Confirmo la revisión de " if language == "es" else "Para enviar escreva: Confirmo a revisão de ") + tx["transaction_id"])
        outputs = payload["custom_outputs"] or {
            "thread_id": cid, "use_case": "COMPLAINT", "intent": None,
            "language": language, "blocked": False, "handoff": None,
        }
        item = {"id": str(uuid.uuid4()), "type": "message", "role": "assistant",
                "status": "completed", "content": [{"type": "output_text", "text": reply, "annotations": []}]}
        if not body.stream:
            return {"output": [item], "custom_outputs": outputs}

        async def events():
            delta = {"type": "response.output_text.delta", "item_id": item["id"], "output_index": 0,
                     "content_index": 0, "delta": reply}
            done = {"type": "response.output_item.done", "output_index": 0, "item": item,
                    "custom_outputs": outputs}
            for event in (delta, done):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(events(), media_type="text/event-stream")

    @app.post("/api/advisor/{conversation_id}/claim")
    async def claim(conversation_id: str, x_demo_advisor: str | None = Header(default=None)):
        advisor(x_demo_advisor)
        c = find(conversation_id)
        async with c.lock:
            if not c.handoff:
                raise HTTPException(409, "No handoff exists for this conversation")
            if c.handled_by == "human_agent":
                return view(c)
            draft = _draft(c)
            draft.handled_by = "human_agent"
            draft.messages.append(_row("system", "Te atiende un asesor." if c.language == "es" else "Um atendente está com você."))
            commit(c, draft)
            return view(c)

    @app.post("/api/advisor/{conversation_id}/messages")
    async def advisor_message(conversation_id: str, body: AdvisorReply, x_demo_advisor: str | None = Header(default=None)):
        advisor(x_demo_advisor)
        c = find(conversation_id)
        digest = hashlib.sha256(body.model_dump_json().encode()).hexdigest()
        async with c.lock:
            key = "advisor:" + body.request_id
            cached = c.replies.get(key)
            if cached:
                if cached[0] != digest:
                    raise HTTPException(409, "Request ID was already used with different input")
                return cached[1]
            if c.handled_by != "human_agent":
                raise HTTPException(409, "Claim the conversation before replying")
            if not body.message.strip():
                raise HTTPException(422, "An advisor reply cannot be blank")
            if len(c.messages) >= 200:
                raise HTTPException(429, "Demo conversation message limit reached")
            draft = _draft(c)
            draft.messages.append(_row("human_agent", body.message))
            payload = view(draft)
            draft.replies[key] = (digest, payload)
            commit(c, draft)
            return payload

    return app


app = create_app()


def main():
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(description="Synthetic local dispute demo, no external services")
    parser.add_argument("--port", type=int, default=8010)
    args = parser.parse_args()
    uvicorn.run("src.local_dispute_demo:app", host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
