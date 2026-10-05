# Validation: Idioma global de la app

## Automated tests

- `cd front && npx vitest run`, `npx tsc -p tsconfig.json --noEmit` (no new errors in `src/`), `npm run build`.
- E2E: the full suite once, only if no other Playwright run is active (`pgrep -f "playwright test"`).
- Unit: same keys in es and pt; lib labels in PT with the global language.
- E2E: the rail button switches the language; the rail, the console and Metrics are in PT; the body still carries `language`.

## Manual checks

- In :3200, as admin, with Português: the console (views, reasons, Bandeja/Agente AI, open chat, Contexto panel) and Metrics are in Portuguese. Bank data stays as it comes.

## Definition of Done

One language button in the nav rail switches every screen between ES and PT, and David still gets the chosen language.
