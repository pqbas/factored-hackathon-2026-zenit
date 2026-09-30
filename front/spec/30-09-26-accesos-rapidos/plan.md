# Plan: Accesos rápidos en Mis productos

1. `src/components/action-card.tsx` (new): `ACTION_STYLES`, `MOVEMENTS_STYLE` and `ActionCard`. `suggested-actions.tsx` uses them.
2. `src/components/products/quick-actions.tsx` (new): `t.actions` + `seeMovements`; each card navigates to `/?query=<prompt>`.
3. `product-overview.tsx`: `QuickActions` under the greeting.
4. `card-carousel.tsx`: no per-card actions. `cardChatPrompt` and its texts go.
5. Tests:
   - unit: suite green (`cardChatPrompt` test removed);
   - no integration test;
   - e2e `products.test.ts`: 5 quick actions, one sends its prompt to `POST /api/chat`, and there is no `card-action-*`.
