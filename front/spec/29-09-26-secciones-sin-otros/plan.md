# Plan: Secciones con nombre real, sin "Otros"

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `src/lib/advisor.ts` | existing | Modified: `intent` in `AdvisorChat`, section ids `out_of_scope`, `no_reason` and `taken`, `davidSectionOf`, `groupByHandoffReason`, `sectionLabel`, `reasonTagOf` |
| `src/components/conversations/use-case-style.tsx` | existing | Modified: styles for the three new sections |

---

## Group 1: Sections

1. In `src/lib/advisor.ts`:
   - Add `'intent'` to the `Chat` Pick of `AdvisorChat`.
   - Add the constants `OUT_OF_SCOPE_SECTION = 'out_of_scope'`, `NO_REASON_SECTION = 'no_reason'` and `TAKEN_SECTION = 'taken'`, plus `OUT_OF_SCOPE_INTENTS = ['OUT_OF_SCOPE', 'COMMERCIAL']`.

2. `davidSectionOf(chat)`:
   - Return the case section if `useCase` maps one (as today).
   - Else return `OUT_OF_SCOPE_SECTION` if `chat.intent` is in `OUT_OF_SCOPE_INTENTS`.
   - Else return `NO_REASON_SECTION`.
   - `DAVID_SECTIONS` ends in `OUT_OF_SCOPE_SECTION, NO_REASON_SECTION` (no `NO_HANDOFF_GROUP`).

3. `groupByHandoffReason`: a chat without `handoff?.reason` goes to `TAKEN_SECTION`, last. Its label comes from `sectionLabel` (no inline 'Otros').

4. `sectionLabel`:
   - `out_of_scope` → 'Fuera de alcance';
   - `no_reason` → 'Sin motivo aún';
   - `taken` → 'Tomada por un asesor';
   - `general` → as today; anything else → `handoffReasonLabel`.
   - Remove the `NO_HANDOFF_GROUP` branch and its import if nothing else uses it in the file.

5. `reasonTagOf`: in Agente AI return `null` for `NO_REASON_SECTION`, else the section (out_of_scope included). Update the comment above `groupByHandoffReason` ("Otros" → "Tomada por un asesor").

6. `NO_HANDOFF_GROUP` in `src/lib/handoff-case.ts` goes if nothing uses it after step 4 (grep `src/` and `tests/`).

---

## Group 2: Styles

7. In `src/components/conversations/use-case-style.tsx`, `REASON_STYLE`/`handoffReasonStyle`:
   - `taken` → the `HUMAN_AGENT` style (violet, UserRound).
   - `out_of_scope` → neutral chip with the `Ban` icon.
   - `no_reason` → neutral chip with the `MessageCircle` icon.
   - The chip text still comes from `sectionLabel`.

---

## Group 3: Tests

8. `tests/unit/advisor.test.ts`:
   - `groupByDavidSection`:
     - `intent` OUT_OF_SCOPE and COMMERCIAL go to `out_of_scope` ("Fuera de alcance");
     - GREETING, null and HUMAN_AGENT go to `no_reason` ("Sin motivo aún"), last;
     - a chat with `useCase` COMPLAINT and `intent` OUT_OF_SCOPE stays in Reclamo;
     - no group is labelled 'Otros'.
   - `groupByHandoffReason`: the chat without a handoff goes to `taken` ("Tomada por un asesor"), last.
   - `reasonTagOf`: `out_of_scope` for an ai_agent chat with intent OUT_OF_SCOPE, and null for `no_reason`.

9. No new integration test: these are pure grouping functions, and unit plus e2e cover them.

10. `back/tests/e2e/conversations.test.ts`:
    - The mock gets an ai_agent chat with `intent: 'OUT_OF_SCOPE'` and one with `intent: 'GREETING'`.
    - Agente AI shows `inbox-section-out_of_scope` ("Fuera de alcance") and `inbox-section-no_reason` ("Sin motivo aún"), in that order at the end.
    - The Bandeja test replaces `reason-chip-NONE` / "Otros" with `reason-chip-taken` / "Tomada por un asesor" (c-other, c-race).
    - No `reason-chip-NONE` anywhere.
