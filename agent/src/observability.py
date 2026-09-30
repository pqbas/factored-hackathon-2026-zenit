from __future__ import annotations

import logging
import os

import mlflow

logger = logging.getLogger(__name__)


def pin_mlflow_experiment() -> str | None:
    """Sets the experiment once. With only MLFLOW_EXPERIMENT_ID, MLflow looks the experiment up
    over REST at every trace start (a new WorkspaceClient each time: ~2 s locally per turn)."""
    experiment_id = os.getenv("MLFLOW_EXPERIMENT_ID")
    if not experiment_id:
        return None
    try:
        mlflow.set_experiment(experiment_id=experiment_id)
    except Exception as exc:  # noqa: BLE001 - tracing must never stop the agent from starting
        logger.warning("Could not pin the MLflow experiment: %s", type(exc).__name__)
        return None
    return experiment_id
