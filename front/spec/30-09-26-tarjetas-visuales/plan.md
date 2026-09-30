# Plan: Tarjetas visuales en Mis productos

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `src/lib/conversations.ts` | existing | Modified: `paletteIndex(key, size)` (the FNV-1a hash), used by `avatarColor` |
| `src/lib/products.ts` | existing | Modified: `cardColor(product)`, `maskedCardNumber(last4)`, `cardChatPrompt(kind, product)` |
| `src/components/products/credit-card-visual.tsx` | — | New: the visual card |
| `src/components/products/card-carousel.tsx` | — | New: scroll-snap carousel, dots and the selected card's detail with actions |
| `src/components/products/product-overview.tsx` | existing | Modified: renders "Mis tarjetas" when there are cards |
| `src/lib/i18n.ts` | existing | Modified: `products.myCards`, `creditCard`, `seeMovements`, `claimCharge` and the prompts, es/pt |

## Steps

1. `paletteIndex` + 8 card gradients (`bg-linear-135`, the same hues as the avatars, deeper) in `cardColor`.
2. `CreditCardVisual`:
   - aspect 1.586 and `rounded-2xl`;
   - `BrandMark` top-left, "Tarjeta de crédito" top-right;
   - the masked number in mono, the currency bottom-right;
   - white text;
   - `data-testid="card-visual-<last4>"` and `aria-pressed` when selected.
3. `CardCarousel`:
   - A flex container with `overflow-x-auto snap-x snap-mandatory`; items at `w-[85%] sm:w-80 shrink-0 snap-center`.
   - The `onScroll` handler computes the index.
   - Dots (`card-dot-<i>`) call `scrollIntoView`.
   - Below, the selected card's detail: stat tiles (used, limit, available), the usage bar, `TransactionList` filtered with `transactionsFor`, and the two actions (`card-action-movements`, `card-action-claim`) that `navigate('/?query=' + prompt)`.
4. `ProductOverview`: renders `CardCarousel` when there are cards, between the totals and the last movements.

## Tests

5. `tests/unit/products.test.ts`:
   - `maskedCardNumber('1070')` gives '•••• •••• •••• 1070';
   - `cardColor` is stable, no gray;
   - `cardChatPrompt` includes the last 4 digits.
6. No integration test.
7. `back/tests/e2e/products.test.ts`:
   - with two cards, the carousel shows two visual cards and two dots;
   - clicking the second selects it and its detail changes;
   - the masked number is shown and the full number never is;
   - "Reclamar un cargo" goes to `/?query=` with the last 4 digits.
