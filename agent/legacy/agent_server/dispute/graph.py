"""LangGraph state machine for charge-dispute intake.

Routing is deterministic: the LLM only fills ``understanding`` (intent + slots).
Identity comes from the trusted session, data reads are scoped to that customer,
eligibility/escalation come from ``policy.py``, replies come from ``i18n.py``
templates, and a case is reported to the customer only after it is read back.

Stages:  START -> COLLECT <-> SELECT -> CONFIRM -> (DONE | HANDOFF)
"""

from __future__ import annotations

import logging
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Any, TypedDict

from langchain_core.messages import AIMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from agent_server.dispute import policy
from agent_server.dispute.data import BankData, DataUnavailableError, DisputeCase, Transaction
from agent_server.dispute.i18n import format_tx, format_tx_short, msg, normalize, why
from agent_server.dispute.nlu import baseline_understand, llm_understand, parse_selection, parse_yes_no

logger = logging.getLogger(__name__)

SEARCH_WINDOW_DAYS = 60  # when the customer gives no date
DATE_TOLERANCE_DAYS = 3
MAX_OPTIONS = 5
MAX_SEARCH_ATTEMPTS = 2  # failed searches before handing off
MAX_TOOL_FAILURES = 2


class DisputeState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    session: dict  # re-resolved by the server on every turn
    thread_id: str
    stage: str
    language: str
    understanding: dict
    details: dict  # accumulated slots: merchant, amount, date, texts
    candidates: list[dict]
    selected: dict | None
    search_attempts: int
    tool_failures: int
    decision: dict | None
    case: dict | None
    handoff: dict | None
    audit: list[dict]  # execution record: every tool call and decision, with outcome
    route: str  # internal: node chosen by the dispatcher


def _latest_user_text(state: DisputeState) -> str:
    for m in reversed(state.get("messages", [])):
        if isinstance(m, dict) and m.get("role") == "user":
            return str(m.get("content", ""))
        if getattr(m, "type", None) == "human":
            return str(m.content)
    return ""


def _lang(state: DisputeState) -> str:
    return state.get("language") or "es"


def _say(key: str, state: DisputeState, **kw) -> AIMessage:
    return AIMessage(content=msg(key, _lang(state), **kw))


def _audit(state: DisputeState, step: str, outcome: str, t0: float | None = None, **detail) -> list[dict]:
    entry = {"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "step": step, "outcome": outcome, **detail}
    if t0 is not None:
        entry["latency_ms"] = round((time.perf_counter() - t0) * 1000)
    return [*state.get("audit", []), entry]


def _json_details(details: dict) -> dict:
    return {k: (v.isoformat() if isinstance(v, date) else v) for k, v in details.items()}


def _date_or_none(v) -> date | None:
    if v is None or isinstance(v, date):
        return v
    return date.fromisoformat(v)


def build_dispute_graph(data: BankData, llm: Any = None, checkpointer=None):
    """Compile the dispute workflow. ``llm=None`` runs the keyword baseline (tests / eval baseline)."""

    # -- helpers bound to the data backend ------------------------------------

    def handoff_packet(state: DisputeState, reason: str, rules: list[str] | None = None) -> dict:
        tx = state.get("selected")
        details = state.get("details", {})
        unresolved = []
        if not tx:
            unresolved.append("Transaction not identified by the assistant.")
        if reason == "tool_failure":
            unresolved.append("Data tools failed; facts above may be incomplete.")
        return {
            "reason": reason,
            "customer_request": details.get("texts", []),
            "verified_facts": {
                "customer_id": state["session"]["customer_id"],
                "session_verified": True,
                "transaction": tx,
                "customer_segment": details.get("segment"),
                "customer_country": details.get("country"),
                "open_cases": details.get("open_cases"),
            },
            "policy": {"version": policy.POLICY_VERSION, "rules": rules or [],
                       "explanations": [policy.RULES[r] for r in rules or [] if r in policy.RULES]},
            "actions_taken": [a for a in state.get("audit", []) if a["step"] not in ("understand",)],
            "unresolved_questions": unresolved,
            "language": _lang(state),
        }

    def save_case(state: DisputeState, status: str, route: str, rules: list[str], handoff: dict | None) -> tuple[dict | None, list[dict]]:
        """Write the case, then read it back. Returns (case, audit); case is None unless verified."""
        tx = state.get("selected")
        cid = state["session"]["customer_id"]
        case = DisputeCase(
            case_id=f"DSP-{uuid.uuid4().hex[:10].upper()}", customer_id=cid,
            transaction_id=tx["transaction_id"] if tx else None, created_at=datetime.now(timezone.utc).replace(tzinfo=None),
            status=status, route=route, amount=tx["amount"] if tx else None, currency=tx["currency"] if tx else None,
            amount_usd=tx.get("amount_usd") if tx else None,
            customer_reason=" | ".join(state.get("details", {}).get("texts", []))[:2000],
            policy_rules=rules, handoff=handoff, language=_lang(state), thread_id=state.get("thread_id"),
        )
        t0 = time.perf_counter()
        try:
            data.create_dispute(case)
            stored = data.get_dispute(cid, case.case_id)
        except DataUnavailableError as exc:
            return None, _audit(state, "create_dispute", "error", t0, error=str(exc)[:200])
        if stored is None:
            return None, _audit(state, "create_dispute", "not_verified", t0, case_id=case.case_id)
        return stored.to_dict(), _audit(state, "create_dispute", "verified", t0, case_id=case.case_id, status=status)

    # -- nodes ---------------------------------------------------------------------

    def gate(state: DisputeState) -> dict:  # sync: LangGraph runs it in a thread, so blocking I/O is fine
        session = state.get("session") or {}
        if not session.get("authenticated"):
            key = "auth_expired" if session.get("reason") == "expired" else "auth_missing"
            lang = baseline_understand(_latest_user_text(state), date.today())["language"] or _lang(state)
            return {"route": "end", "language": lang,
                    "messages": [AIMessage(content=msg(key, lang))],
                    "audit": _audit(state, "session", f"rejected:{session.get('reason')}")}
        updates: dict[str, Any] = {"route": "understand"}
        if state.get("stage") in ("DONE", "HANDOFF"):  # previous request finished: start a fresh one
            updates.update({"stage": "START", "details": {}, "candidates": [], "selected": None, "search_attempts": 0,
                            "tool_failures": 0, "decision": None, "case": None, "handoff": None})
        details = updates.get("details", state.get("details") or {})
        if not details.get("as_of"):
            t0 = time.perf_counter()
            try:
                customer = data.get_customer(session["customer_id"])
            except DataUnavailableError as exc:
                return {"route": "end", "messages": [_say("tool_error", state)],
                        "audit": _audit(state, "get_customer", "error", t0, error=str(exc)[:200])}
            if customer is None:
                return {"route": "end", "messages": [_say("auth_missing", state)],
                        "audit": _audit(state, "get_customer", "not_found", t0)}
            updates["details"] = {**details, "as_of": customer.as_of_date.isoformat(), "first_name": customer.first_name,
                                  "segment": customer.segment, "country": customer.country, "open_cases": customer.open_cases,
                                  "customer_status": customer.customer_status}
            updates["audit"] = _audit(state, "get_customer", "ok", t0)
        return updates

    async def understand(state: DisputeState) -> dict:
        text = _latest_user_text(state)
        as_of = _date_or_none((state.get("details") or {}).get("as_of")) or date.today()
        stage = state.get("stage", "START")
        t0 = time.perf_counter()
        # Replies to a yes/no or pick-a-number question are parsed deterministically; skip the LLM call.
        deterministic = (stage == "CONFIRM" and parse_yes_no(text) is not None) or (
            stage == "SELECT" and parse_selection(text, len(state.get("candidates", []))) is not None)
        if llm and not deterministic:
            u = await llm_understand(llm, text, as_of, stage)
        else:
            u = baseline_understand(text, as_of)
        language = state.get("language") or u["language"] or "es"
        if u["language"] and u["language"] != language and stage == "START":
            language = u["language"]
        return {"understanding": {**u, "date": u["date"].isoformat() if u["date"] else None},
                "language": language,
                "audit": _audit(state, "understand", u["intent"], t0, source=u["source"])}

    def dispatch(state: DisputeState) -> dict:
        u = state["understanding"]
        stage = state.get("stage", "START")
        text = _latest_user_text(state)
        if u["intent"] == "HUMAN_AGENT":
            return {"route": "handoff"}
        if u["intent"] == "CANCEL":
            return {"route": "cancel"}

        if stage == "SELECT":
            k = parse_selection(text, len(state.get("candidates", [])))
            if k == 0:
                return {"route": "reject_candidate"}
            if k:
                return {"route": "confirm", "selected": state["candidates"][k - 1]}
            if parse_yes_no(text) is not None:  # "yes"/"no" does not say which one
                return {"route": "select_again"}
            return {"route": "search"}  # treat as more details

        if stage == "CONFIRM":
            yn = parse_yes_no(text)
            if yn is True:
                return {"route": "decide"}
            if yn is False:
                return {"route": "reject_candidate"}
            if u["amount"] or u["date"] or u["merchant"]:
                return {"route": "search"}
            return {"route": "confirm_again"}

        # START / COLLECT
        if u["intent"] == "GREETING" and stage == "START":
            return {"route": "greet"}
        if u["intent"] == "OUT_OF_SCOPE" and stage == "START":
            return {"route": "out_of_scope"}
        return {"route": "search"}

    def greet(state: DisputeState) -> dict:
        name = state.get("details", {}).get("first_name")
        return {"messages": [_say("greeting", state, name=f" {name}" if name else "")]}

    def out_of_scope(state: DisputeState) -> dict:
        return {"messages": [_say("out_of_scope", state)]}

    def cancel(state: DisputeState) -> dict:
        return {"stage": "DONE", "messages": [_say("cancelled", state)], "audit": _audit(state, "cancel", "ok")}

    def search(state: DisputeState) -> dict:
        u = state["understanding"]
        details = dict(state.get("details") or {})
        text = _latest_user_text(state)
        details["texts"] = [*details.get("texts", []), text][-6:]
        for k in ("merchant", "amount", "date"):
            if u.get(k):
                details[k] = u[k]
        all_text = normalize(" ".join(details["texts"]))
        as_of = _date_or_none(details["as_of"])
        d = _date_or_none(details.get("date"))
        if d:
            date_from, date_to = d - timedelta(days=DATE_TOLERANCE_DAYS), min(d + timedelta(days=DATE_TOLERANCE_DAYS), as_of)
        else:
            date_from, date_to = as_of - timedelta(days=SEARCH_WINDOW_DAYS), as_of

        t0 = time.perf_counter()
        try:
            txs = data.list_transactions(state["session"]["customer_id"], date_from, date_to)
        except DataUnavailableError as exc:
            failures = state.get("tool_failures", 0) + 1
            audit = _audit(state, "list_transactions", "error", t0, error=str(exc)[:200])
            if failures >= MAX_TOOL_FAILURES:
                return {"details": details, "tool_failures": failures, "audit": audit, "route": "handoff",
                        "handoff": {"reason": "tool_failure"}}
            return {"details": details, "tool_failures": failures, "audit": audit, "stage": "COLLECT",
                    "messages": [_say("tool_error", state)], "route": "end"}
        audit = _audit(state, "list_transactions", "ok", t0, rows=len(txs), date_from=date_from.isoformat(), date_to=date_to.isoformat())

        # Merchant criterion: explicit slot, or any merchant of the window named in the conversation.
        def merchant_hit(t: Transaction) -> bool:
            if not t.merchant_name:
                return False
            m = normalize(t.merchant_name)
            slot = normalize(details["merchant"]) if details.get("merchant") else None
            return m in all_text or (slot is not None and (slot in m or m in slot))

        merchant_given = bool(details.get("merchant")) or any(merchant_hit(t) for t in txs)
        amount = details.get("amount")
        has_criteria = merchant_given or amount is not None or d is not None
        if not has_criteria:
            return {"details": details, "stage": "COLLECT", "audit": audit, "route": "end",
                    "messages": [_say("ask_details", state)]}

        matches = [
            t for t in txs
            if (not merchant_given or merchant_hit(t))
            and (amount is None or abs(t.amount - amount) <= max(1.0, 0.01 * amount))
        ]
        audit = _audit({**state, "audit": audit}, "match_transactions", f"{len(matches)} matches",
                       criteria={"merchant": merchant_given, "amount": amount is not None, "date": d is not None})
        attempts = state.get("search_attempts", 0)
        if not matches:
            attempts += 1
            if attempts >= MAX_SEARCH_ATTEMPTS:
                return {"details": details, "search_attempts": attempts, "audit": audit, "route": "handoff",
                        "handoff": {"reason": "no_match"}}
            window = f" ({date_from.isoformat()} – {date_to.isoformat()})"
            return {"details": details, "search_attempts": attempts, "stage": "COLLECT", "audit": audit, "route": "end",
                    "messages": [_say("no_match", state, window=window)]}
        cands = [t.to_dict() for t in matches[:MAX_OPTIONS]]
        if len(matches) == 1:
            return {"details": details, "candidates": cands, "audit": audit, "route": "confirm", "selected": cands[0]}
        options = "\n".join(f"{i}. {format_tx(c, _lang(state))}" for i, c in enumerate(cands, 1))
        key = "select" if len(matches) <= MAX_OPTIONS else "too_many"
        return {"details": details, "candidates": cands, "stage": "SELECT", "audit": audit, "route": "end",
                "messages": [_say(key, state, options=options, count=len(matches))]}

    def confirm(state: DisputeState) -> dict:
        tx = state["selected"]
        return {"stage": "CONFIRM", "messages": [_say("confirm", state, tx=format_tx(tx, _lang(state)))]}

    def select_again(state: DisputeState) -> dict:
        options = "\n".join(f"{i}. {format_tx(c, _lang(state))}" for i, c in enumerate(state["candidates"], 1))
        return {"messages": [_say("select", state, options=options)]}

    def confirm_again(state: DisputeState) -> dict:
        return {"messages": [_say("confirm_again", state, tx_short=format_tx_short(state["selected"]))]}

    def reject_candidate(state: DisputeState) -> dict:
        details = dict(state.get("details") or {})
        for k in ("merchant", "amount", "date"):
            details.pop(k, None)
        return {"stage": "COLLECT", "selected": None, "candidates": [], "details": details,
                "messages": [_say("rejected_candidate", state)], "audit": _audit(state, "candidate", "rejected_by_customer")}

    def decide(state: DisputeState) -> dict:
        tx_dict = state["selected"]
        tx = Transaction.from_dict(tx_dict)
        cid = state["session"]["customer_id"]
        if tx.customer_id != cid:  # defense in depth: never act on another customer's data
            return {"route": "handoff", "handoff": {"reason": "ownership_mismatch"},
                    "audit": _audit(state, "ownership_check", "failed")}
        t0 = time.perf_counter()
        try:
            customer = data.get_customer(cid)
            existing = data.find_open_dispute(cid, tx.transaction_id)
        except DataUnavailableError as exc:
            return {"route": "handoff", "handoff": {"reason": "tool_failure"},
                    "audit": _audit(state, "policy_inputs", "error", t0, error=str(exc)[:200])}
        decision = policy.evaluate(tx, customer, existing, _date_or_none(state["details"]["as_of"]))
        audit = _audit(state, "policy", decision.outcome, t0, rules=decision.rules, version=decision.version)
        state = {**state, "audit": audit, "decision": decision.to_dict()}
        short = format_tx_short(tx_dict)

        if decision.outcome == "NOT_ELIGIBLE":
            return {"stage": "DONE", "decision": decision.to_dict(), "audit": audit, "route": "end",
                    "messages": [_say("not_eligible", state, tx_short=short, why=why(decision.rules, _lang(state)))]}

        if decision.outcome == "ESCALATE":
            packet = handoff_packet(state, "policy_escalation", decision.rules)
            case, audit = save_case(state, "Escalated", "HUMAN", decision.rules, packet)
            if case is None:
                return {"stage": "HANDOFF", "decision": decision.to_dict(), "audit": audit, "handoff": packet, "route": "end",
                        "messages": [_say("handoff_unsaved", state)]}
            return {"stage": "HANDOFF", "decision": decision.to_dict(), "audit": audit, "handoff": packet, "case": case,
                    "route": "end",
                    "messages": [_say("escalated", state, tx_short=short, case_id=case["case_id"], why=why(decision.rules, _lang(state)))]}

        case, audit = save_case(state, "Open", "AUTO", decision.rules, None)
        if case is None:
            return {"decision": decision.to_dict(), "audit": audit, "route": "handoff", "handoff": {"reason": "tool_failure"}}
        return {"stage": "DONE", "decision": decision.to_dict(), "audit": audit, "case": case, "route": "end",
                "messages": [_say("case_created", state, tx_short=short, case_id=case["case_id"])]}

    def handoff(state: DisputeState) -> dict:
        reason = (state.get("handoff") or {}).get("reason") or "customer_request"
        rules = ["ESC_CUSTOMER_REQUEST"] if reason == "customer_request" else []
        packet = handoff_packet(state, reason, rules)
        case, audit = save_case(state, "Escalated", "HUMAN", rules, packet)
        if case is None:
            return {"stage": "HANDOFF", "handoff": packet, "audit": audit, "messages": [_say("handoff_unsaved", state)]}
        suffix = f" (caso **{case['case_id']}**)"
        return {"stage": "HANDOFF", "handoff": packet, "case": case, "audit": audit,
                "messages": [_say("handoff", state, case=suffix)]}

    # -- wiring --------------------------------------------------------------------

    g = StateGraph(DisputeState)
    for name, fn in [("gate", gate), ("understand", understand), ("dispatch", dispatch), ("greet", greet),
                     ("out_of_scope", out_of_scope), ("cancel", cancel), ("search", search), ("confirm", confirm),
                     ("confirm_again", confirm_again), ("select_again", select_again), ("reject_candidate", reject_candidate), ("decide", decide),
                     ("handoff", handoff)]:
        g.add_node(name, fn)

    def by_route(state: DisputeState) -> str:
        r = state.get("route", "end")
        return END if r == "end" else r

    g.add_edge(START, "gate")
    g.add_conditional_edges("gate", by_route, ["understand", END])
    g.add_edge("understand", "dispatch")
    g.add_conditional_edges("dispatch", by_route, ["handoff", "cancel", "reject_candidate", "confirm", "search",
                                                   "decide", "confirm_again", "select_again", "greet", "out_of_scope"])
    g.add_conditional_edges("search", by_route, ["confirm", "handoff", END])
    g.add_conditional_edges("decide", by_route, ["handoff", END])
    for terminal in ("greet", "out_of_scope", "cancel", "confirm", "confirm_again", "select_again", "reject_candidate", "handoff"):
        g.add_edge(terminal, END)
    return g.compile(checkpointer=checkpointer)
