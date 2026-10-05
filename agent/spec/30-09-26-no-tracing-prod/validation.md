# Validation: the prod App runs without MLflow tracing

- [ ] `uv run pytest -q` exits 0
- [ ] Unit: `AGENT_TRACING` parsing, and `configure_tracing` in both modes
- [ ] E2E: a turn with tracing off produces no trace
- [ ] After the next deploy (w1:p1): the App logs no longer show "Failed to send trace to MLflow backend"

Definition of Done: tests pass, merged to main, no deploy.
