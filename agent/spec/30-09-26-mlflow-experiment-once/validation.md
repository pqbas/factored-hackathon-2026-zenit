# Validation: MLflow resolves the experiment once

- [ ] `uv run pytest -q` exits 0
- [ ] Unit: after pinning, resolving the experiment makes no call to the tracking server; no variable is a no-op; a failure doesn't raise
- [ ] Manual (w1:p1): held-out 20×3 against prod before and after deploying this fix, comparing p50 and p95 per turn

Definition of Done: tests pass, merged to main; the prod before/after is w1:p1's run after they deploy it.
