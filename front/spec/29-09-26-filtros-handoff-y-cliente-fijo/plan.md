# Plan: Filtros por motivo de derivación y cliente demo fijo

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `src/lib/advisor.ts` | existing | Modified: views `handoffReason` and `advisor` (replace `useCase` and `mine`), URL params, counts, grouping by reason |
| `src/lib/handoff-case.ts` | existing | Modified: `HANDOFF_REASONS` (id + label), used by filters and grouping |
| `src/components/conversations/inbox-views.tsx` | existing | Modified: three reason filters with always-visible counters; "Con asesor" instead of "Mías" |
| `src/components/conversations/inbox-list.tsx` | existing | Modified: sections by handoff reason ("Otros" last) |
| `src/components/conversations/use-case-style.tsx` | existing | Modified: chip and icon per handoff reason (reuse the rose, amber and orange hues) |
| `src/pages/ConversationsPage.tsx` | existing | Modified: view titles |
| `src/lib/demo-customer-storage.ts` | existing | Modified: `chooseCustomerToken` (session pick), `chatCustomerToken(chatId, fromBack)` |
| `src/components/chat.tsx` | existing | Modified: token from the back for existing chats; picking sets the session; opening a chat doesn't |
| `src/pages/ChatPage.tsx` | existing | Modified: passes `demoCustomerToken` from `GET /api/chat/:id` |
| `src/pages/ProductsPage.tsx` | existing | Modified: uses `chooseCustomerToken` |

---

## Group 1: Console views and counters

1. In `src/lib/handoff-case.ts` add `HANDOFF_REASONS = [{ id: 'complaint', label: 'Reclamo' }, { id: 'retention', label: 'Cancelación de producto' }, { id: 'case_status', label: 'Estado de un reclamo' }]` and `NO_HANDOFF_GROUP = 'NONE'` ("Otros").

2. In `src/lib/advisor.ts`:
   - `InboxView`: replace `{ kind: 'useCase'; useCase }` with `{ kind: 'reason'; reason }`, and `{ kind: 'mine' }` with `{ kind: 'advisor' }`.
   - `viewUrl`: `reason` → `handoffReason=<id>`; `advisor` → `handledBy=human_agent`. Everything else stays.
   - `ViewCounts`: replace `useCases` with `reasons: Record<string, number>` and `mine` with `advisor`. `parseCounts` reads `byHandoffReason` and `withAdvisor`, with 0 when missing.
   - `countFor` and `sameView` follow the new views.
   - `groupByHandoffReason(items)`: same shape as `groupByUseCase`, keyed by `chat.handoff?.reason`, in `HANDOFF_REASONS` order, with `NONE` last. Keep `USE_CASES` (the metrics panel uses it, `src/lib/metrics.ts`) and take it out of the console only; `groupByUseCase` goes once nothing uses it. The use-case tag in the header stays through `useCaseTag`.

3. In `src/components/conversations/inbox-views.tsx`:
   - Section "Motivo de derivación": three `item({ kind: 'reason', reason })` entries with their icon.
   - `ViewItem` shows the counter even at 0 (a `showZero` prop for these three).
   - In Estado, replace "Mías" with "Con asesor" (`view-advisor`, UserCheck icon).

4. In `src/components/conversations/use-case-style.tsx` add `handoffReasonStyle(id)` and `HandoffReasonChip`: complaint rose, retention orange, case_status amber, NONE neutral.

5. In `src/components/conversations/inbox-list.tsx` group with `groupByHandoffReason` and render sections with `HandoffReasonChip` (`inbox-section-<reason>`).

5b. In `src/lib/handoff-case.ts` add `handoffDetail(handoff)`: the `complaint_type` label, or `product_type ••product_last4`, else null. In `src/components/conversations/inbox-list.tsx` the row chip (`row-handoff`) shows `handoffDetail`, and doesn't render without it.

5c. Rename the ai_agent view to "Agente AI": add `DAVID_VIEW_LABEL = 'Agente AI'` in `src/lib/advisor.ts` and use it in `inbox-views.tsx` (sidebar item) and `ConversationsPage.tsx` (`VIEW_TITLE.david`) instead of `STATUS_LABEL.assistant`. The row and header state keeps `STATUS_LABEL.assistant` ("Con AI"). Update e2e assertions that look for the view title or item text.

5d. Move the handoff card into the context panel:
   - Remove `HandoffCard` from `src/components/conversations/conversation-view.tsx`: both the one pinned above the messages and the folded ones in earlier segments.
   - `CustomerContextPanel` (`src/components/conversations/customer-context-panel.tsx`) takes `handoff` and renders `HandoffCard` as its first section, above the tabs, even when there is no bank customer (204) or the bank fails.
   - In `src/pages/ConversationsPage.tsx`, opening a customer whose active conversation has a handoff opens the panel without saving that choice. The toggle still closes it.
   - Adjust the e2e test for the handed-off case to find the card inside `customer-context`.

6. In `src/pages/ConversationsPage.tsx`, `viewTitle`: `reason` → its label; `advisor` → `STATUS_LABEL.advisor` ("Con asesor").

---

## Group 2: Demo customer fixed for the session

7. In `src/lib/demo-customer-storage.ts`:
   - `chooseCustomerToken(token)`: the session pick. It writes `demo-customer:last` and updates the active token (sidebar and greeting).
   - `chatCustomerToken(chatId, fromBack)`: returns `fromBack ?? getChatCustomerToken(chatId)`.

8. In `src/pages/ChatPage.tsx` pass `initialCustomerToken={chat.demoCustomerToken ?? null}` to `Chat`.

9. In `src/components/chat.tsx`:
   - Initial state `customerToken = chatCustomerToken(id, initialCustomerToken)`; locked if it has messages and a token.
   - A new chat with no token: `pickDefaultToken(customers, getLastCustomerToken())`, as today.
   - `onCustomerChange` in the header calls `setCustomerToken(t)` and `chooseCustomerToken(t)`.
   - Remove the effect that calls `setActiveCustomerToken(customerToken)` when a chat opens. On the first message, only `setChatCustomerToken` is saved (not `setLastCustomerToken`: that one is already the session pick).

10. In `src/pages/ProductsPage.tsx`, `changeCustomer` uses `chooseCustomerToken(next)`.

---

## Group 3: Tests

11. `tests/unit/advisor.test.ts`:
    - `viewUrl` with `reason` (`handoffReason=complaint`) and `advisor` (`handledBy=human_agent`);
    - `parseCounts` with `byHandoffReason` and `withAdvisor`;
    - `countFor` returns 0 for a reason without data;
    - `groupByHandoffReason` puts the three reasons in order and "Otros" last.

12. `tests/unit/demo-customer-storage.test.ts`:
    - `chooseCustomerToken` updates last and active;
    - `chatCustomerToken` prefers the back's token, then the browser's, then null.

13. No new integration test: the change is mapping params and local state, and unit plus e2e cover it.

14. `back/tests/e2e/conversations.test.ts`:
    - The mock supports `handoffReason`, `byHandoffReason` and `withAdvisor`, evaluated on each customer's ongoing conversation (the last one without `closedAt`). Daniela's resolved earlier conversation (c-old) gets a retention handoff that must not count.
    - Exactly three reason filters with counters, "0" visible included; Reclamo lists only Daniela.
    - "Con asesor" lists c-other (held by another advisor) and asks for `handledBy=human_agent`.
    - The Bandeja has sections by reason and "Otros".

15. `back/tests/e2e/demo-customer.test.ts`:
    - Pick Javier, create a new conversation, then open an existing one and come back: it stays Javier.
    - An existing chat with `demoCustomerToken: 'demo-mx-1'` shows Santiago, locked, and doesn't change the session: the new chat stays Javier.
