# Validation: Movimientos sin duplicar en Mis productos

- `npx vitest run`, `tsc` (no new errors in `src/`), `npm run build`.
- The focused e2e for `products.test.ts`, and the full suite once before the PR, only if no other Playwright run is active.
- Manual, in :3200 (read-only): Eduardo (cards only) no longer shows a second list, and Natalia shows "Movimientos de tus cuentas" with her savings movements only.

Definition of Done: each movement shows once on the summary, card movements under their card and savings movements in their own section.
