# Validation: "David está escribiendo" durante toda la espera

- `npx vitest run`, `npx tsc -p tsconfig.json --noEmit` (no new errors in `src/`), `npm run build`.
- E2E `chat-handoff.test.ts` when the test Postgres (:55432) is reachable, one suite at a time.
- Manual, with the API mocked in a browser:
  - a slow streamed answer shows the indicator until the text;
  - a queued turn shows it until the polled answer;
  - a chat with an advisor never shows it.

Definition of Done: from send to the first text of David's answer there is always an indicator, on every path, and an empty David message shows no actions.
