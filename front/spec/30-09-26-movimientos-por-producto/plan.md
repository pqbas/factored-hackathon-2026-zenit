# Plan: Movimientos por producto

- `src/lib/products.ts`: `savingsTransactions` sorts by date (desc) and returns at most 10.
- Tests:
  - unit: `savingsTransactions` caps at 10 and sorts;
  - no integration test;
  - e2e `products.test.ts`: with movements for both cards, each selected card shows its own.
