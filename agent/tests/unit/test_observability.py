from __future__ import annotations

import mlflow
import pytest
from mlflow.tracking import fluent
from mlflow.tracking._tracking_service.client import TrackingServiceClient

from src.observability import pin_mlflow_experiment


@pytest.fixture
def local_store(tmp_path, monkeypatch):
    mlflow.set_tracking_uri(f"sqlite:///{tmp_path}/mlflow.db")
    monkeypatch.setattr(fluent, "_active_experiment_id", None)
    yield mlflow.create_experiment("agent")
    mlflow.set_tracking_uri(None)


def test_without_the_variable_nothing_is_pinned(local_store, monkeypatch):
    monkeypatch.delenv("MLFLOW_EXPERIMENT_ID", raising=False)
    assert pin_mlflow_experiment() is None
    assert fluent._active_experiment_id is None


def test_a_pinned_experiment_is_reused_without_asking_the_tracking_server(local_store, monkeypatch):
    monkeypatch.setenv("MLFLOW_EXPERIMENT_ID", local_store)
    assert pin_mlflow_experiment() == local_store

    def _no_lookups(*args, **kwargs):
        raise AssertionError("the experiment was looked up again")

    monkeypatch.setattr(TrackingServiceClient, "get_experiment", _no_lookups)
    assert [fluent._get_experiment_id() for _ in range(3)] == [local_store] * 3


def test_a_failing_pin_does_not_stop_the_agent(monkeypatch):
    monkeypatch.setenv("MLFLOW_EXPERIMENT_ID", "123")

    def _fail(**kwargs):
        raise RuntimeError("tracking server down")

    monkeypatch.setattr(mlflow, "set_experiment", _fail)
    assert pin_mlflow_experiment() is None
