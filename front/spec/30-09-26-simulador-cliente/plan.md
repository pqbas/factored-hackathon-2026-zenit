# Plan: Simulador de cliente

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `src/components/nav-rail.tsx` | existing | Modified: label and icon of the `agent` item depend on the role |
| `src/components/demo-customer-selector.tsx` | existing | Modified: dataset hint and menu title |

## Steps

1. `nav-rail.tsx`:
   - `NavItem.label` and `icon` can be functions of the role.
   - For `agent`:
     - customer: `${ASSISTANT_NAME} (asistente virtual)` with `MessageCircle`;
     - advisor or admin: 'Simulador de cliente (demo)' with `FlaskConical`.
2. `demo-customer-selector.tsx`:
   - `DEMO_CUSTOMER_HINT = 'Clientes del dataset sintético del hackathon: elige a cuál simular'`.
   - A `DropdownMenuLabel` titled 'Dataset sintético del hackathon' (`demo-customer-dataset`) at the top of the menu.

## Tests

3. No unit test: these are texts by role.
4. No integration test either, for the same reason.
5. `back/tests/e2e/roles.test.ts`:
   - `nav-agent` has aria-label "David (asistente virtual)" for customer and no role;
   - it has "Simulador de cliente (demo)" for advisor and admin.
6. `back/tests/e2e/demo-customer.test.ts`:
   - the new hint text;
   - the menu shows "Dataset sintético del hackathon".
