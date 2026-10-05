# Plan: Movimientos sin duplicar en Mis productos

| Module | Origin | Change |
| --- | --- | --- |
| `src/lib/products.ts` | existing | Modified: `savingsTransactions(transactions, products)` |
| `src/components/products/product-overview.tsx` | existing | Modified: the movements section only with savings, filtered and renamed |
| `src/lib/i18n.ts` | existing | Modified: `accountMovements` es/pt |

1. `savingsTransactions` keeps the movements whose product (type + last4) is a savings product.
2. `ProductOverview`:
   - `overview-movements` renders only when `hasSavings`, with `accountMovements` and `savingsTransactions`;
   - without it, "Mis datos" renders on its own, at the narrow width.
3. Tests:
   - unit: `savingsTransactions`;
   - no integration test;
   - e2e (`products.test.ts`, focused):
     - with cards only, there is no movements section, and each card's movement shows only under it;
     - with savings, the section shows only the savings movements.
