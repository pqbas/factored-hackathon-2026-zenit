# Plan: simulated sessions from a Lakebase table

| Module | Origin | Change |
| --- | --- | --- |
| `src/db/session_repo.py` | existing | `async resolve_session`, with the `sim-` lookup |
| `src/db/sim_sessions.py` | new | `lookup_sim_session(pool, token)`: the fixed query |
| `src/main.py` | existing | `await resolve_session(...)` |
| `src/config.py` | existing | `sim_sessions_table` (`SIM_SESSIONS_TABLE`, default `bank_sessions.sim_sessions`), validated as `schema.table` identifiers |

1. `src/db/sim_sessions.py`: `async lookup_sim_session(pool, token) -> dict | None`. It runs the fixed query with `token` as a psycopg parameter and returns `{customer_id, country, expires_at}` or None. The table name comes from settings, validated with the same identifier check as `bank_ro_schema`.
2. `src/db/session_repo.py`: `async def resolve_session(custom_inputs, now=None, pool=None)`.
   - A missing token gives `missing`.
   - A demo entry is checked as today.
   - A `sim-` token is looked up (with the pool defaulting to `LazyLakebasePool()`). Any exception gives `invalid` and a warning with the exception type only. No row gives `invalid`, and a past `expires_at` gives `expired`.
   - Anything else gives `invalid`.
3. `src/main.py`: `session = await resolve_session(custom_inputs)`.
4. Tests:
   - unit (`tests/unit/test_session_repo.py`): demo tokens as before with no pool call; a `sim-` row that is valid, expired or missing; a pool timeout gives `invalid`; a non-`sim-` unknown token never touches the pool; the query is parameterized;
   - integration: a turn with a `sim-` token from a fake pool answers with that customer's data;
   - e2e: `/invocations` with a `sim-` token, where a failing pool gives the session-rejected reply.
