# Requirements: MLflow resolves the experiment once, not on every trace

Profiling a minimal call (w1:p4's latency finding) showed that every root trace costs about 2 s locally. MLflow resolves the experiment from `MLFLOW_EXPERIMENT_ID` with a REST call each time a trace starts, and that call builds a new `WorkspaceClient()` to get credentials. MLflow only caches the id when `mlflow.set_experiment()` was called. In prod the App authenticates with OAuth M2M, so the cost is estimated at 0.3–0.7 s per turn.

## 1. Functional requirements

1. At startup the agent calls `mlflow.set_experiment(experiment_id=MLFLOW_EXPERIMENT_ID)` once, when the variable is set. Later traces reuse that id without any REST call.
2. Without `MLFLOW_EXPERIMENT_ID` (tests, local runs without `.env`), nothing changes.
3. If that call fails at startup, the agent logs a warning and still starts; traces fall back to today's behavior.
4. Traces keep going to the same experiment.

## 2. Decisions

- It's one call at import in `src/main.py`, next to `mlflow.langchain.autolog()`. It sits in a small function in `src/observability.py` so it can be tested.
- The test proves that after pinning, resolving the experiment id makes no call to the tracking server.
- Measured locally, a minimal traced call goes from 2.3–3.1 s to 0.56 s. The prod effect is measured by w1:p1: the held-out run on the current deployment is the "before", and the same run after deploying this fix is the "after".

## 3. Context

- `src/main.py` (`mlflow.langchain.autolog()`);
- MLflow `tracking/fluent.py`: `_get_experiment_id`, `_get_experiment_id_from_env`, `set_experiment`.
