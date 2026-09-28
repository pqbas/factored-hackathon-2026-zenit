# Plan: El chat del cliente durante un handoff

Rama: `feat/pqbas-front-phase1c-chat-handoff`, desde `main`. Solo Tailwind v4.

| Module | Origin | Change |
| --- | --- | --- |
| `src/lib/handoff.ts` | — | New: `handledByOf`, `isStateOnlyMessage`, `mergeNewMessages`, `senderOf`, `handoffNotice`, `fetchHandledBy`, `fetchNewMessages` |
| `src/hooks/use-handoff.ts` | — | New: estado + polling |
| `src/lib/utils.ts` | existing | Modified: `senderType` en `metadata` |
| `src/components/chat.tsx` | existing | Modified: `onData`, `onFinish`, aviso |
| `src/components/message.tsx`, `messages.tsx` | existing | Modified: asesor y avisos |
| `src/pages/ChatPage.tsx` | existing | Modified: `initialHandledBy` |

## Group 1: Lógica
1. `src/lib/handoff.ts` y `src/hooks/use-handoff.ts`.

## Group 2: UI
2. `chat.tsx`: estado desde `data-conversation-state`, quitar el mensaje vacío
   en `onFinish`, releer el estado, aviso sobre el campo.
3. `message.tsx` / `messages.tsx`: icono y etiqueta "Asesor", avisos `system`.

## Group 3: Tests
4. Unit `tests/unit/handoff.test.ts`.
5. Integration `tests/integration/handoff-api.test.ts` con `fetch` falso.
6. E2E `back/tests/e2e/chat-handoff.test.ts` con `page.route`: respuesta con
   solo el estado, aviso, polling con mensajes del asesor, avisos del sistema y
   vuelta al agente.
