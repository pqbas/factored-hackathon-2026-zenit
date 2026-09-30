# Validation: Tarjetas visuales en Mis productos

## Automated tests

- `cd front && npx vitest run`, `npx tsc -p tsconfig.json --noEmit` (no new errors in `src/`), `npm run build`.
- E2E: only `back/tests/e2e/products.test.ts` (`--grep`), and only if no other Playwright run is active; the full suite once before the PR, same rule.
- Unit: masked number, stable color, prompt with last4.
- E2E: carousel with two cards and dots, selection, masked number only, the claim action opens the chat.

## Manual checks

- On a phone-width viewport, a card fills most of the width and the next one peeks; swiping snaps to each card.
- ES and PT: section title, card label, actions.

## Definition of Done

Credit cards show as visual cards in a carousel with the selected card's balance, limit, available credit, usage and movements. No invented data, and actions only open the chat with David.
