# Validation: Bandeja o Agente AI dentro de cada motivo

## Automated tests

- `cd front && npx vitest run`, `npx tsc -p tsconfig.json --noEmit` (no new errors in `src/`), `npm run build`.
- Playwright e2e (same command as earlier phases), with :3100 free.
- Unit: `viewUrl` with scope david, `parseCounts` with `aiAgentByUseCase`, and the URL round-trip.
- E2E: the switch in Reclamo, its counts, the request with `useCase`, and the choice kept across a reload.

## Manual checks

- In :3200, Reclamo → Agente AI lists the complaints David is still collecting. Bandeja shows the handed-off ones, the same as today.
- The sidebar counts don't change when switching options.
- Reloading on `?reason=complaint&scope=david` opens the same view.

## Definition of Done

Every reason view switches between Bandeja and Agente AI with a count on each option, remembered in the URL. Unit and e2e pass.
