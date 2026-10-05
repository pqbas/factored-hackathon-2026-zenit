# Validation: Evolución de tus ahorros

## Automated tests

- `cd front && npx vitest run`, `npx tsc -p tsconfig.json --noEmit` (no new errors in `src/`), `npm run build`.
- E2E: `products.test.ts` with `--grep`, and the full suite once before the PR, only if no other Playwright run is active.

## Manual checks

- Against :3200, once w1:p1's endpoint is on main (read-only): Natalia (demo-mx-5) shows her savings dropping from about $16k in April to $2.5k today, with the estimated label. The same in PT.

## Definition of Done

Mis productos shows the savings evolution per currency, labelled as an estimate, and the page still works when the history isn't available. Unit and e2e pass.
