# Validation: Datos del cliente en el panel Contexto

## Automated tests

Top-level commands:

- `cd front && npx vitest run`: all green.
- `cd front && npx tsc -p tsconfig.json --noEmit`: no new errors in `src/` (only the 4 already on main).
- `cd front && npm run build`: builds.
- `cd back && FRONT_URL=http://localhost:3100 PORT=3100 NODE_ENV=production TEST_MODE=ephemeral PLAYWRIGHT=True npx playwright test tests/e2e --project=e2e --workers=2`: all green, with :3100 free first.

Test cases that must exist:

### Unit

- `customer-context.test.ts`:
  - `parseCustomerContext` returns `profile` with its fields, and null without it.
  - `profileFields` for Santiago gives, in order:
    1. Ubicación "Tijuana, México";
    2. Segmento "Plus";
    3. Estado "Activo";
    4. Cliente desde "3 jul 2022";
    5. Productos "Tarjeta Crédito ••1070";
    6. Email;
    7. Canal preferido "Teléfono".
    Without "Celular" (null) and without the customer id.
  - An unknown status or channel is shown as it comes.

### End-to-end

- Opening a conversation with a customer shows "Datos del cliente" as the panel's first section, above "Caso derivado por David".
- The fields match the mock: location, segment, status, customer since, products, email and preferred channel.
- The customer id doesn't appear in the panel.
- Without `profile`, the section isn't shown and the rest of the panel stays as it is.

## Manual checks

- Against `:3200`, once w1:p1's change is on main, read-only: a new conversation with Santiago (demo-mx-1) shows México / Tijuana, Plus, Activo, 3 jul 2022, Tarjeta Crédito ••1070, his email and Teléfono.
- A conversation without a bank customer (204) shows no "Datos del cliente" and the panel keeps its message.
- The name and "Cliente •• XXXX" stay only in the chat header.

## Definition of Done

The context panel opens with the customer's main data exactly as the bank has it, with no repetition of the header, with unit, e2e and the manual check against the real back passing. The merge happens after w1:p1's back is on main.
