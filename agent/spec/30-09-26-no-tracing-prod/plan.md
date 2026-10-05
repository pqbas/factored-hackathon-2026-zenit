# Plan: the prod App runs without MLflow tracing

1. `src/config.py`: `tracing_enabled`, from `AGENT_TRACING` (default on; `off`, `false` and `0` turn it off).
2. `src/observability.py`: `configure_tracing(enabled)`. Off: `mlflow.tracing.disable()`. On: autolog and `pin_mlflow_experiment()`.
3. `src/main.py`: call it at import, and guard `update_current_trace` and `setup_mlflow_git_based_version_tracking()` with `settings.tracing_enabled`.
4. `app.yaml`: `AGENT_TRACING=off`. `docs/15-observabilidad.md`, linked from the README.
5. Tests:
   - the setting's parsing;
   - `configure_tracing(False)` disables tracing without autolog or pin, and `True` does both;
   - e2e: a turn over `/invocations` with tracing off produces no trace.
