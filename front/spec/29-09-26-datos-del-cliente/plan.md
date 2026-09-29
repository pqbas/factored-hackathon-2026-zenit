# Plan: Datos del cliente en el panel Contexto

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `src/lib/customer-context.ts` | existing | Modified: `CustomerProfile` type, `profile` in `parseCustomerContext`, `customerStatusLabel`, `profileFields(profile)` |
| `src/components/conversations/customer-profile-card.tsx` | — | New: the "Datos del cliente" record |
| `src/components/conversations/customer-context-panel.tsx` | existing | Modified: renders the card first, above "Caso derivado por David" |

---

## Group 1: Data

1. In `src/lib/customer-context.ts`:
   - `CustomerProfile { customerId, country, city, segment, status, customerSince, products: { productType, last4 }[], contact: { email, mobilePhone }, preferredChannel }`, every field `string | null`.
   - `CustomerContext.profile: CustomerProfile | null`.
   - `parseCustomerContext` reads `profile` with the same tolerant helpers (`str`, `list`); `products` filters out entries with neither type nor last4.

2. In the same file:
   - `customerStatusLabel(status)`: Active → Activo, Inactive → Inactivo, Blocked → Bloqueado, Closed → Cerrado; unknown values as they come.
   - `profileFields(profile)` → `{ key, label, value }[]` in the requirements order:
     - Ubicación: `city, country`.
     - Segmento, Estado (`customerStatusLabel`) and Cliente desde (`formatContextDate`).
     - Productos: one value per product, `productType ••last4`.
     - Email, Celular, and Canal preferido (`channelLabel`).
   - Missing values are skipped. `customerId` is left out (it's in the header).

---

## Group 2: UI

3. Create `src/components/conversations/customer-profile-card.tsx`:
   - A `section` with `data-testid="customer-profile"` and the title "Datos del cliente".
   - A `dl` grid like `HandoffCard`'s record (`handoff-card.tsx`): `grid-cols-[auto_minmax(0,1fr)]`, `text-xs`, labels muted.
   - Products render one line each inside their `dd`.
   - Returns null when `profileFields` is empty.

4. In `src/components/conversations/customer-context-panel.tsx`, render `CustomerProfileCard` with `data.profile` as the first section of the scrolling area, above the `HandoffCard`, only once `data` is loaded.

---

## Group 3: Tests

5. `tests/unit/customer-context.test.ts`:
   - `parseCustomerContext` reads `profile`, and null or junk becomes null or [];
   - `customerStatusLabel` for known and unknown values;
   - `profileFields` for Santiago's example (order, "Tijuana, México", "Activo", "3 jul 2022", "Tarjeta Crédito ••1070", "Teléfono") and without customerId;
   - a profile with only nulls gives [].

6. No new integration test: parsing and rendering are covered by unit and e2e.

7. `back/tests/e2e/conversations.test.ts`, in the context panel test:
   - The mock returns `profile`.
   - "Datos del cliente" is the first section, above "Caso derivado por David", with its fields.
   - It doesn't show the customer id.
   - A context without `profile` doesn't render the section.
