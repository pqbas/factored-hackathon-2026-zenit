from __future__ import annotations

import asyncio
import logging

from langchain_core.messages import HumanMessage

from src.graph.nodes.classify import classify
from src.llm.jev import JevUnavailable

TEXT = "quisiera consultar el saldo de mis tarjetas"


class DownJev:
    async def classify(self, text, routes):
        raise JevUnavailable("HTTP 401")


def _classify(jev) -> dict:
    state = {
        "messages": [HumanMessage(content=TEXT)],
        "session": {"authenticated": True, "customer_id": "CLI-TEST", "country": "México"},
    }
    return asyncio.run(classify(state, jev, routes=[], threshold=0.5))


def test_a_failing_jev_logs_its_reason_without_the_customer_text(caplog):
    with caplog.at_level(logging.WARNING, logger="src.graph.nodes.classify"):
        result = _classify(DownJev())
    assert result["classification"]["source"] == "fallback"
    assert "DownJev unavailable, classifying with rules: HTTP 401" in caplog.text
    assert TEXT not in caplog.text


def test_a_missing_classifier_logs_that_it_is_none(caplog):
    with caplog.at_level(logging.WARNING, logger="src.graph.nodes.classify"):
        _classify(None)
    assert "Classifier unavailable, classifying with rules: classifier is None" in caplog.text
