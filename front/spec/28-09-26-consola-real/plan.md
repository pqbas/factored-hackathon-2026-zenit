# Plan: Consola del asesor con datos reales

Rama: `feat/pqbas-front-phase7-consola-real`, desde `main`. Solo Tailwind v4.

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `src/lib/advisor.ts` | — | New: tipos, `statusOf`, `canReply`, `inboxUrl`, `mergeMessages`, `toBubble`, llamadas take/reply/release |
| `src/lib/conversations.ts` | existing | Modified: se quedan los helpers genéricos; sale el reducer |
| `src/mocks/conversations.ts`, `public/mock-attachments/` | existing | Deleted |
| `src/components/conversations/*` | existing | Modified: sobre `AdvisorChat` y burbujas; sin etiquetas ni adjuntos |
| `src/pages/ConversationsPage.tsx` | existing | Modified: SWR + polling + acciones |
| `tests/unit/advisor.test.ts`, `tests/unit/conversations.test.ts` | — / existing | New / Modified |
| `tests/integration/advisor-api.test.ts` | — | New (reemplaza `conversation-reducer.test.ts`) |
| `back/tests/e2e/conversations.test.ts` | existing | Modified: API mockeada |

## Group 1: Lógica
1. `src/lib/advisor.ts` con tipos del contrato, filtros, estado, permisos,
   merge de mensajes, burbujas y llamadas (409 → `{ conflict, assignedTo }`).
2. `src/lib/conversations.ts`: dejar `getInitials`, `groupMessagesByDay`
   (genérico por `sentAt`), `formatListTime`, `STATUS_LABEL`; borrar el resto y
   los mocks.

## Group 2: UI
3. Lista: filtros del contrato, filas con email, caso de uso y estado, "Cargar
   más".
4. Encabezado: email, caso de uso, controles del punto 6 de requirements.
5. Vista: aviso por estado (incluido "La atiende <email>"), burbujas con
   remitente, composer sin adjuntar.
6. Página: SWR de la bandeja con `refreshInterval`, mensajes con intervalo e
   incremento, acciones con toasts en 409.

## Group 3: Tests
7. Unit: `advisor.test.ts` y `conversations.test.ts`.
8. Integration: `advisor-api.test.ts` con `fetch` falso: take con 409, reply,
   release y recarga de mensajes cuando `after` da 400.
9. E2E: `conversations.test.ts` con la API mockeada: bandeja y filtros, tomar,
   responder, devolver, resolver, 409, tomada por otro (composer deshabilitado)
   y admin con `force`.
