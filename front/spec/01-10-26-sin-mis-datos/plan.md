# Plan: Mis productos sin "Mis datos"

- `product-overview.tsx`: remove the `customer-profile` section; the accounts movements section takes the full width.
- `i18n.ts`: drop `myData`, `name`, `customer` (products) in es and pt.
- Tests:
  - e2e `products.test.ts`: `customer-profile` isn't there, and the page doesn't contain the customer id;
  - no new unit or integration test.
