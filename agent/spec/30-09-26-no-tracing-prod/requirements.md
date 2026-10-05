# Requirements: the prod App runs without MLflow tracing

In prod, no trace ever reaches MLflow. The v3 export uploads each trace to a Databricks storage endpoint the App can't reach, so every export failed with "Connection refused" and retried in the background. The user chose option (a): the App runs without tracing, keeping it simple. Local runs keep tracing.

## 1. Functional requirements

1. With `AGENT_TRACING=off` (set in `app.yaml`), the agent doesn't enable LangChain autolog, doesn't pin the experiment, and calls `mlflow.tracing.disable()`, so it never tries to upload a trace. It also skips `update_current_trace` (in `main.py` and the `classify.*` tags in `classify.py`) and the git-based `LoggedModel` setup, so MLflow logs no "No active trace found" warning.
2. Without the variable (the default, `on`), local runs keep today's tracing: autolog with the experiment pinned once (#98).
3. Turns behave the same either way.

## 2. Decisions

- This MLflow version has no environment variable to turn tracing off, so the switch is our own `AGENT_TRACING`, read in `src/config.py`.
- The pin from #98 stays for local runs, where it saves about 2 s per turn.
- Observability in prod is pending: Langfuse or LangSmith (free tier) will be evaluated later, especially if the App moves to AWS. Recorded in `docs/15-observabilidad.md`.

## 3. Context

- `src/main.py`, `src/observability.py`, `src/config.py`, `app.yaml`.
