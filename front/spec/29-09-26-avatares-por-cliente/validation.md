# Validation: Avatares con color por cliente

## Automated tests

- `cd front && npx vitest run`, `npx tsc -p tsconfig.json --noEmit` (no new errors in `src/`), `npm run build`.
- Playwright e2e (see earlier phases), with :3100 free.
- Unit: the same key gives the same color; the customerId → customerKey → userId order; spread across customers from one user; no grays.
- E2E: the row avatar and the header avatar are the same color.

## Manual checks

- In :3200, Agente AI and the Bandeja show avatars in several colors. None is gray.
- The white initials read well in light and dark themes.

## Definition of Done

Every customer has its own color, stable between the list and the header, from an 8-color palette with no grays. Unit and e2e pass.
