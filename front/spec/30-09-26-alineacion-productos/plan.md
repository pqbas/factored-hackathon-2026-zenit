# Plan: Alineación en Mis productos

- `action-card.tsx`: `h-[4.5rem]`, `min-w-0`, `truncate`, `title`.
- `product-overview.tsx`: the totals in `sm:grid-cols-3`.
- `card-carousel.tsx`:
  - the track without `-mx`/`px` and `relative`;
  - items `snap-start` with the grid's column widths;
  - the usage bar without `px-1`;
  - selection by the left edge, respecting a scroll in progress.
- `credit-card-visual.tsx`: `items-baseline`, the number `truncate` with a size per breakpoint, and an inset ring.
- Tests:
  - the products and demo-customer e2e stay green (they cover the carousel and the chat cards);
  - no new unit test (only classes and scroll behaviour);
  - no integration test.
