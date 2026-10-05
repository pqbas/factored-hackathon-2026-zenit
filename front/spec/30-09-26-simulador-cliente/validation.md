# Validation: Simulador de cliente

## Automated tests

- `cd front && npx vitest run`, `npx tsc -p tsconfig.json --noEmit` (no new errors in `src/`), `npm run build`.
- `cd back && scripts/playwright-test.sh tests/e2e --project=e2e` with the usual variables: green.
- E2E for roles:
  - the rail per role (customer and no role: agent and products; advisor: agent and chats; admin: all four);
  - the agent label per role;
  - /conversations blocked for customer, /metrics blocked for advisor.
- E2E for the selector: the dataset hint and the menu title.

## Manual checks

- As admin in :3200, the rail says "Simulador de cliente (demo)" with the flask icon. The selector explains the synthetic dataset.

## Definition of Done

Advisors and admins see the chat with David as a customer simulator. Customers keep their chat with David. The selector says the customers come from the hackathon's synthetic dataset. Roles are covered by e2e.
