# Plan: Evolución de tus ahorros

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `src/lib/products.ts` | existing | Modified: `SavingsSeries`, `parseSavingsHistory`, `fetchSavingsHistory`, `savingsWithoutSeries(products, series)` |
| `src/components/products/savings-chart.tsx` | — | New: the section with one line chart per currency |
| `src/components/products/product-overview.tsx` | existing | Modified: takes `sessionToken` and renders the section when there are savings |
| `src/pages/ProductsPage.tsx` | existing | Modified: passes the token |
| `src/lib/i18n.ts` | existing | Modified: es/pt texts |

## Steps

1. `products.ts`:
   - `parseSavingsHistory` keeps series with numeric points, sorted by month.
   - `fetchSavingsHistory(token)` calls `/api/products/savings-history`; it throws on errors, and the chart just hides.
   - `savingsWithoutSeries` gives `{ currency, current }` for savings currencies without a series.
2. `savings-chart.tsx`:
   - SWR `['savings-history', token]`.
   - Per series:
     - the current balance, large;
     - an SVG with the line, a soft area and 12 points with `<title>`;
     - the last point filled and larger (today);
     - month labels (short month name from the i18n `months`) and the max/min on the side.
   - Test ids: `savings-chart-<currency>` and `savings-point-<month>`.
   - The "estimated" label is under the title.
3. `ProductOverview`: renders `SavingsChart` above the cards when `hasSavings`.

## Tests

4. `tests/unit/products.test.ts`:
   - `parseSavingsHistory` (sorting, junk out);
   - `savingsWithoutSeries`.
5. No integration test.
6. E2E `back/tests/e2e/products.test.ts` (focused):
   - with a savings product and a mocked history, the chart shows 12 points, the current balance and the estimated label;
   - a currency without a series shows only its balance;
   - a 502 from the history hides the section without breaking the page.
