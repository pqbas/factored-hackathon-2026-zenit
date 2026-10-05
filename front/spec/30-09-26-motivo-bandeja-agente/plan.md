# Plan: Bandeja o Agente AI dentro de cada motivo

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `src/lib/advisor.ts` | existing | Modified: `scope` in the reason view, `REASON_USE_CASE`, `viewUrl`, `ViewCounts.davidByReason`, `parseCounts`, `viewFromParams` and `viewParams` |
| `src/components/conversations/reason-scope-switch.tsx` | — | New: the segmented control |
| `src/components/conversations/inbox-list.tsx` | existing | Modified: `toolbar` prop under the title |
| `src/pages/ConversationsPage.tsx` | existing | Modified: view from and to the URL, the switch, grouping and the empty message |

## Group 1: Data

1. In `src/lib/advisor.ts`:
   - `InboxView` reason gets `scope?: 'inbox' | 'david'`.
   - `REASON_USE_CASE = { complaint: 'COMPLAINT', retention: 'RETENTION', case_status: 'CASE_STATUS' }`.
   - `viewUrl`: reason with scope `david` sends `handledBy=ai_agent&useCase=<X>` and no `handoffReason`; with scope `inbox`, the same as today.
   - `ViewCounts.davidByReason: Record<string, number>`: `parseCounts` reads `aiAgentByUseCase` through `REASON_USE_CASE`, and leaves it empty when the field is missing.
   - `viewFromParams(params)`: a known `reason` becomes `{kind:'reason', reason, scope}`, else `{kind:'inbox'}`.
   - `viewParams(view)`: returns `{ reason, scope? }` for a reason view, `{}` otherwise; scope is only written when it's `david`.

## Group 2: UI

2. New `reason-scope-switch.tsx`, `ReasonScopeSwitch({ scope, inboxCount, davidCount?, onChange })`:
   - `role="tablist"` with a `bg-secondary` background, `rounded-lg`, `p-0.5`.
   - Buttons `scope-inbox` and `scope-david`. The active one gets `bg-background shadow-sm dark:bg-input` and `aria-selected`.
   - Each count in `scope-<id>-count`; the Agente AI count isn't rendered when it's undefined.
3. In `inbox-list.tsx`, an optional `toolbar?: ReactNode` rendered in a row under the header.
4. In `ConversationsPage.tsx`:
   - `useSearchParams`: the initial `view` comes from `viewFromParams`, and `openView` writes `viewParams` (replace).
   - For a reason view, pass the switch as `toolbar`: counts `counts.reasons[r]` and `counts.davidByReason[r]`, and `onChange` calls `openView({...view, scope})`.
   - `grouping` stays null for reason views.
   - The empty message for scope `david`: "David no atiende ningún caso de este motivo ahora."

## Group 3: Tests

5. `tests/unit/advisor.test.ts`:
   - `viewUrl` for reason with scope david: `handledBy=ai_agent&useCase=COMPLAINT`, no `handoffReason`;
   - `parseCounts` with and without `aiAgentByUseCase`;
   - `viewFromParams` / `viewParams` round-trip, with an unknown reason becoming inbox.
6. No integration test: it's mapping params, and unit plus e2e cover it.
7. `back/tests/e2e/conversations.test.ts`:
   - The mock supports `useCase` and returns `aiAgentByUseCase`, and has an ai_agent chat with COMPLAINT.
   - Reclamo shows the switch. Bandeja is active by default and lists Daniela. Agente AI lists the COMPLAINT chat, with its count, and asks for `handledBy=ai_agent&useCase=COMPLAINT`.
   - The URL has `scope=david`. Reloading keeps Reclamo on Agente AI.
