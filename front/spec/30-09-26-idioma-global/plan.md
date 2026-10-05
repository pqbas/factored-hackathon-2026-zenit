# Plan: Idioma global de la app

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `src/lib/i18n.ts` | existing | Modified: `tr()`, `currentLang` and `setCurrentLang`, `LANG_NAMES`; new keys for nav, console, metrics, products and errors |
| `src/contexts/LangContext.tsx` | existing | Modified: sets the global language and remounts with `key={lang}` |
| `src/components/lang-toggle.tsx` | — | New: the "ES"/"PT" button in the nav rail |
| `src/components/nav-rail.tsx` | existing | Modified: `LangToggle` above the theme button, and nav labels through `t` |
| `src/components/chat-header.tsx` | existing | Modified: no language switch |
| Console, Metrics, Products and `lib` helpers | existing | Modified: strings through `t` / `tr()` |

## Group 1: Base (done first)

1. Global language (`tr()`), the remount, the `LangToggle` in the rail (the avatar keeps its tooltip) and removing the switch from the chat header.

## Group 2: Texts

2. Nav: `nav-rail.tsx` (labels, simulator, theme, "Menú principal") and `require-section.tsx` / no access.
3. Console:
   - `src/lib/advisor.ts`: `STATUS_LABEL`, `sectionLabel`, `attentionOf`, `holderLabel` ('tú'), `DAVID_VIEW_LABEL`;
   - `src/lib/handoff-case.ts`: `HANDOFF_REASONS` labels, `caseFields` labels;
   - `src/lib/customer-context.ts`: labels;
   - `src/lib/conversations.ts`: `STATUS_LABEL`, `formatListTime`, `groupByDay`;
   - `src/components/conversations/*`;
   - `src/pages/ConversationsPage.tsx`.
4. Metrics: `src/lib/metrics.ts` (ranges, `useCaseRows` labels), `src/components/metrics/*`, `src/pages/MetricsPage.tsx`.
5. Products: `src/pages/ProductsPage.tsx`.
6. date-fns: `locale` from the current language (`es` / `ptBR`) wherever it's used.

## Group 3: Tests

7. `tests/unit/i18n.test.ts`: es and pt have the same keys, at every level.
8. `tests/unit/advisor.test.ts`: with `setCurrentLang('pt')`, `sectionLabel` and `STATUS_LABEL` come out in Portuguese (restored to es afterwards).
9. No integration test.
10. E2E:
    - `roles.test.ts` or a new `language.test.ts`: the rail button changes to Português, and the rail, the console (Bandeja → "Caixa de entrada") and Metrics titles are in PT;
    - the chat tests move from `lang-pt` to `lang-toggle`.
