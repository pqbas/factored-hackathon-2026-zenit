# Validation: Filtros por motivo de derivación y cliente demo fijo

## Automated tests

Top-level commands (from `front/` and `back/`):

- `cd front && npx vitest run`: all green.
- `cd front && npx tsc -p tsconfig.json --noEmit`: no new errors in `src/` (only the 4 already on main).
- `cd front && npm run build`: builds.
- `cd back && FRONT_URL=http://localhost:3100 PORT=3100 NODE_ENV=production TEST_MODE=ephemeral PLAYWRIGHT=True npx playwright test tests/e2e --project=e2e --workers=2`: all green, with :3100 free first.

Test cases that must exist:

### Unit

- `advisor.test.ts`:
  - `viewUrl({kind:'reason', reason:'complaint'})` includes `handoffReason=complaint` and `groupBy=customer`;
  - `viewUrl({kind:'advisor'})` includes `handledBy=human_agent`;
  - `parseCounts` maps `byHandoffReason` and `withAdvisor`, with 0 when missing;
  - `groupByHandoffReason` returns complaint, retention, case_status, then NONE.
- `demo-customer-storage.test.ts`:
  - `chooseCustomerToken` updates `demo-customer:last` and notifies the active token;
  - `chatCustomerToken(id, 'demo-mx-1')` returns the back's token even when the browser has another.

### End-to-end

- Console:
  - Only three reason filters (Reclamo, Cancelación de producto, Estado de un reclamo), each with a counter, "0" included.
  - Reclamo asks for `handoffReason=complaint` and lists the complaint's customer.
  - A customer whose resolved earlier conversation had a retention handoff does not appear in, or count towards, Cancelación: only the ongoing conversation counts.
  - "Con asesor" asks for `handledBy=human_agent`; "Mías" no longer exists.
  - The Bandeja shows sections by reason and "Otros".
- Customer chat:
  - Pick Javier, move to another conversation and back: the selector still says "Cliente demo: Javier · Colombia".
  - An existing chat whose back says `demoCustomerToken: 'demo-mx-1'` shows Santiago, locked, even if the session is Javier.

## Manual checks

- Against the real back (`:3200`, once w1:p1's change is on main), read-only:
  - The three reason filters show real counters.
  - Reclamo lists scenario 04's complaint (Santiago).
  - "Con asesor" lists the conversations in `human_agent`.
- In the customer chat:
  - Pick Javier, open an old Santiago conversation from the list: the selector shows Santiago, locked.
  - Go back to "Nueva conversación": the selector says Javier, and the sidebar and greeting are Javier's.
- Reload the page on a new chat: it's still Javier.

## Definition of Done

All three reason filters and "Con asesor" work with real counters against the back, and the chosen demo customer no longer changes when switching conversations, with unit, e2e and manual checks passing. The merge happens after w1:p1's back is on main.
