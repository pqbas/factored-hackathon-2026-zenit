# Plan: "David está escribiendo" durante toda la espera

| Module | Origin | Change |
| --- | --- | --- |
| `src/lib/handoff.ts` | existing | Modified: `isAwaitingDavid({ status, messages, handledBy, agentPending })` |
| `src/components/messages.tsx` | existing | Modified: takes `handledBy` and `agentPending`; the bottom indicator uses `isAwaitingDavid` |
| `src/components/chat.tsx` | existing | Modified: passes `handledBy` and `agentPending` to `Messages` |
| `src/components/message-actions.tsx` | existing | Modified: no actions for an assistant message without text |

1. `isAwaitingDavid({ status, messages, handledBy, agentPending })` returns where the indicator goes: `'message'`, `'list'` or `null`.
   - `null` unless `handledBy === 'ai_agent'`.
   - Busy (`submitted` or `streaming`): `'message'` if the last message is David's and has no text yet; `'list'` if the last message is the customer's.
   - Queued (`agentPending`) with the customer's message last: `'list'`.
2. `messages.tsx`:
   - `PreviewMessage.isLoading` is true for the last message while busy (`submitted` or `streaming`), not only while `streaming`.
   - The bottom indicator shows when `isAwaitingDavid(...) === 'list'` (keeping the reasoning-model exception).
   - Add the new props to the memo comparison.
3. `message-actions.tsx`: return null for an assistant message whose text is empty.
4. Tests:
   - unit `handoff.test.ts`:
     - `'list'` for `submitted` with the customer's message last, and for a queued turn;
     - `'message'` for `submitted` or `streaming` with an empty David message last;
     - `null` with an advisor, once David's text arrived, and when idle.
   - no integration test;
   - e2e `chat-handoff.test.ts` (run when the test Postgres is back):
     - a stream that sends `start` and then nothing for a while keeps the indicator visible until the text;
     - in the queued-turn test, the indicator is visible while waiting and gone when David's answer arrives;
     - an empty assistant message shows no copy action.
