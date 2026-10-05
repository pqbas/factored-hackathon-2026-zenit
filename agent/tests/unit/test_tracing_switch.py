from __future__ import annotations

import mlflow
import pytest

from src import observability
from src.config import Settings


@pytest.mark.parametrize("value, enabled", [(None, True), ("on", True), ("off", False), ("OFF", False), ("false", False), ("0", False)])
def test_agent_tracing_setting(monkeypatch, value, enabled):
    if value is None:
        monkeypatch.delenv("AGENT_TRACING", raising=False)
    else:
        monkeypatch.setenv("AGENT_TRACING", value)
    assert Settings.from_env().tracing_enabled is enabled


def _spy(monkeypatch):
    calls = []
    monkeypatch.setattr(mlflow.tracing, "disable", lambda: calls.append("disable"))
    monkeypatch.setattr(mlflow.langchain, "autolog", lambda: calls.append("autolog"))
    monkeypatch.setattr(observability, "pin_mlflow_experiment", lambda: calls.append("pin"))
    return calls


def test_tracing_off_disables_it_without_autolog_or_pin(monkeypatch):
    calls = _spy(monkeypatch)
    observability.configure_tracing(False)
    assert calls == ["disable"]


def test_tracing_on_enables_autolog_with_the_pinned_experiment(monkeypatch):
    calls = _spy(monkeypatch)
    observability.configure_tracing(True)
    assert calls == ["autolog", "pin"]


def test_classify_tags_no_trace_when_tracing_is_off(monkeypatch):
    import dataclasses

    from src.graph.nodes import classify
    from src.schemas.classification import Classification

    calls = []
    monkeypatch.setattr(classify.mlflow, "update_current_trace", lambda **kwargs: calls.append(kwargs))
    classification = Classification(
        guardrail="OK", guardrail_probability=0.0, language="es", intent="GREETING",
        intent_confidence=1.0, sentiment="neutral", source="rules",
    )
    monkeypatch.setattr(classify, "settings", dataclasses.replace(classify.settings, tracing_enabled=False))
    classify._tag_trace(classification)
    assert calls == []

    monkeypatch.setattr(classify, "settings", dataclasses.replace(classify.settings, tracing_enabled=True))
    classify._tag_trace(classification)
    assert len(calls) == 1
