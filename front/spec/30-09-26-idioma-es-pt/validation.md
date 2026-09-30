# Validation: Idioma ES | PT en el chat del cliente

## Automated tests

- `cd front && npx vitest run`, `npx tsc -p tsconfig.json --noEmit` (no new errors in `src/`), `npm run build`.
- `cd back && scripts/playwright-test.sh tests/e2e --project=e2e` with the usual variables: green.
- Unit: `defaultLang`, `langFromCustomerLabel`, the same keys in es and pt, and the greeting by hour.
- E2E:
  - ES by default;
  - switching to PT changes the greeting, cards, placeholder and CVV notice;
  - PT is kept across a reload;
  - the body carries `language`;
  - a customer from Brazil starts in PT.

## Manual checks

- In :3200, as admin in the Simulador: pick PT. The whole chat screen is in Portuguese, and a message sent from a card reaches David in Portuguese.
- Once w1:p1 and w1:p3 ship their parts: with PT, a "hola" or a "1" gets a reply in Portuguese.

## Definition of Done

The chat screen switches between ES and PT with a visible control, the choice is remembered, and every message tells the back the chosen language. Unit and e2e pass.
