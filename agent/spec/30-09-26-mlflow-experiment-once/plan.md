# Plan: MLflow resolves the experiment once

| Module | Origin | Change |
| --- | --- | --- |
| `src/observability.py` | new | `pin_mlflow_experiment()` |
| `src/main.py` | existing | Call it once after `mlflow.langchain.autolog()` |
| `tests/unit/test_observability.py` | new | The pinned id is reused without calls to the tracking server |

1. `src/observability.py`, `pin_mlflow_experiment() -> str | None`: reads `MLFLOW_EXPERIMENT_ID`. If it is set, it calls `mlflow.set_experiment(experiment_id=...)` and returns the id. On any exception it logs a warning with the exception type and returns None.
2. `src/main.py`: call it after `mlflow.langchain.autolog()`.
3. Tests, against a local sqlite tracking store:
   - no variable is a no-op;
   - with the variable, after pinning, `mlflow.tracking.fluent._get_experiment_id()` returns the id three times while the store's `get_experiment` is patched to fail;
   - a failing `set_experiment` doesn't raise.
