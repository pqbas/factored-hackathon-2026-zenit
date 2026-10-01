# Validation: Login de demo y cierre de sesión

## Automated tests

- `cd front && npx vitest run`, `npx tsc -p tsconfig.json --noEmit` (no new errors in `src/`), `npm run build`.
- E2E `login.test.ts` and the full suite once, when the test Postgres (:55432) is reachable again and no other Playwright run is active.

## Manual checks

- With w1:pC's back in password mode, locally: the three demo users enter with their role, a wrong password doesn't enter, and closing the session returns to the login.
- In Databricks Apps nothing changes: no login screen and no logout button.

## Definition of Done

In password mode the app requires the demo login and can close the session, in ES and PT. In Databricks mode it behaves as today. No credentials live in the front.
