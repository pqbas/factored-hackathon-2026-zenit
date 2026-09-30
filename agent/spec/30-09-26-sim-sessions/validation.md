# Validation: simulated sessions from a Lakebase table

- [ ] `uv run pytest -q` exits 0
- [ ] Unit: demo tokens don't touch Lakebase; `sim-` valid, expired and missing; a timeout gives `invalid` (fail-closed); non-`sim-` unknown tokens don't query
- [ ] Integration: a `sim-` session reaches the tools with its own customer id
- [ ] E2E: a failing pool with a `sim-` token gives the session-rejected reply
- [ ] Manual, once w1:p1's table exists: a `sim-` token created by their script resolves locally (one query), and an expired one is rejected

Definition of Done: tests pass, the manual check done against the real table, merged to main. w1:p1 redeploys.
