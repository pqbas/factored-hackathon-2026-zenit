# Validation: Alineación en Mis productos

- vitest, tsc (no new errors in `src/`), build; the full e2e suite once, only if no other Playwright run is active.
- Manual, with Santiago at 1400, 900 and 390 px:
  - the carousel sits within the content width;
  - the dots select the right card;
  - number and USD share a line;
  - the quick actions all have the same height.
