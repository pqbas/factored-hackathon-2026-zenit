# Requirements: simulated sessions from a Lakebase table

w1:p4's new task is a daily traffic simulation in prod: 100 conversations a day with real `bank_ro` customers, different each day. Adding 100 customers a day to `DEMO_SESSIONS_JSON` would mean redeploying the agent daily and bloating `app.yaml`. So the sessions of the simulation live in a Lakebase table that the back's script fills (w1:p1's part). The agent looks tokens up there, keeping "one session per customer", with the customer always coming from the session.

## 1. Functional requirements

After this phase, the agent keeps doing what it does today:

1. A token in `DEMO_SESSIONS_JSON` (or the default sessions) resolves exactly as now, without touching Lakebase.
2. A missing token is rejected as `missing`, an unknown one as `invalid`, an expired one as `expired`, with the same replies.

And it changes in these ways:

3. A token that isn't in the demo sessions and starts with `sim-` is looked up in `bank_sessions.sim_sessions`. The table has `token` (PK), `customer_id`, `country`, `expires_at` (timestamptz), `created_at` and `day`. The lookup is one fixed, parameterized query: `SELECT customer_id, country, expires_at FROM bank_sessions.sim_sessions WHERE token = %s`.
4. A row whose `expires_at` has passed is rejected as `expired`. No row means `invalid`.
5. Fail-closed: if Lakebase doesn't answer (the pool's 5 s timeouts) or the query fails, the session is rejected as `invalid` and the turn never reaches the tools. The log keeps the error type only, never the token.
6. Any other token (not demo, not `sim-`) is `invalid` without touching Lakebase.

## 2. Decisions

- A table instead of HMAC-signed tokens: there's no shared secret to hand out, and a session is revoked by deleting its row. The tokens are random (`sim-` + uuid4 or `secrets.token_urlsafe`), created only by the script, so nobody can build one for another customer.
- The same Lakebase pool and identity as the bank data tools. The App's service principal gets only `USAGE` on `bank_sessions` and `SELECT` on `sim_sessions`, which w1:p1's script grants. The agent never writes.
- `resolve_session` becomes async (it's called from the async `streaming`). The demo path stays synchronous inside it, so tests and callers that only use demo tokens behave the same.
- No cache: one lookup per simulated turn, about 0.16 s warm. A cache can come later if latency matters (future).
- Out of scope: creating the table, the grants and the daily script (w1:p1), and the simulation runner.

## 3. Context

- `src/db/session_repo.py` (`resolve_session`, `Session`, `_sessions`), `src/main.py` (`streaming`);
- `src/tools/lakebase.py` (`LazyLakebasePool`, timeouts), `src/config.py`.
