# Plan: Consola del asesor con toma manual

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `packages/db/src/schema.ts` | — | Modified: `Chat.assignedTo/assignedAt/closedAt`, `Message.senderType/senderId`. |
| `packages/db/migrations/0005_*.sql` | — | New: `npm run db:generate` (solo ADD COLUMN). |
| `packages/db/src/queries.ts` | — | Modified: `takeChat`, `releaseChat`, `getMessagesAfter`, filtros de bandeja en `getChats`, `saveMessages` con sender. |
| `packages/core/src/errors.ts` | — | Modified: tipo `conflict` → 409. |
| `server/src/middleware/auth.ts` | `requireAdmin` | Modified: `requireAdvisor`. |
| `server/src/routes/advisor.ts` | `admin.ts` | New: bandeja, messages, take, release. |
| `server/src/routes/messages.ts` | — | Modified: `?after=`. |
| `server/src/routes/chat.ts` | — | Modified: sender en mensajes, `closedAt` al escribir, historial con `[Asesor] `, carrera en `onFinish`. |
| `server/src/index.ts` | — | Modified: `app.use('/api/advisor', advisorRouter)`. |

---

## Group 1: Base de datos

1. `schema.ts`: `chat.assignedTo varchar(256)`, `assignedAt timestamp`,
   `closedAt timestamp` (nullables). `message.senderType varchar enum
   ['customer','ai_agent','human_agent','system']` nullable,
   `senderId varchar(256)` nullable.
2. `npm run db:generate` y revisar que sea solo ADD COLUMN. Commitear el SQL
   y `meta/`.
3. `queries.ts`:
   - `saveMessages`: aceptar `senderType`/`senderId` opcionales.
   - `takeChat({ chatId, advisorEmail, force })`: UPDATE condicional en una
     sola sentencia (`WHERE id = ? AND (handledBy <> 'human_agent' OR
     assignedTo = ? OR force)`). Devuelve `{ chat, changed, conflictWith }`
     para que la ruta sepa si guardar el mensaje system o responder 409.
   - `releaseChat({ chatId, outcome })`.
   - `reopenChat({ chatId })`: `closedAt = null`.
   - `getMessagesAfter({ chatId, afterId })`: busca el mensaje `afterId` en
     ese chat (null → error) y devuelve los posteriores por
     `(createdAt, id)`.
   - `getChats`: filtros `assignedTo` y `status` (`open`/`closed` por
     `closedAt`).

## Group 2: Rutas y permisos

4. `errors.ts`: agregar el tipo `conflict` con status 409.
5. `auth.ts`: `requireAdvisor` (401 sin sesión; 403 si `getRole` no es
   `advisor` ni `admin`).
6. `server/src/routes/advisor.ts`, siguiendo `admin.ts`:
   - `GET /conversations` → `getChats({ scope: 'all', ... })`.
   - `GET /conversations/:id/messages` → 404 si no existe;
     `getMessagesAfter` si hay `after`.
   - `POST /conversations/:id/take` → `force` solo si `getRole` es admin (si
     no, 403); `takeChat`; si cambió el dueño, guarda el mensaje system con el
     texto del contrato.
   - `POST /conversations/:id/messages` → Zod `{ text: 1..4000 }`; 409 si no
     es `human_agent` o `assignedTo` ≠ yo; guarda `role 'assistant'`,
     `senderType 'human_agent'`, `senderId` = yo.
   - `POST /conversations/:id/release` → Zod `{ outcome, note? }`; 409 si no
     está tomada, o si es de otro y yo no soy admin; `releaseChat` + mensaje
     system.
7. `messages.ts`: `?after=` con `getMessagesAfter` (400 si no existe o es de
   otro chat).
8. `index.ts`: registrar el router.

## Group 3: Chat del cliente y carrera

9. `chat.ts`:
   - Guardar el mensaje del cliente con `senderType 'customer'` y la
     respuesta con `senderType 'ai_agent'`.
   - Si el chat tiene `closedAt`, `reopenChat` al recibir el mensaje.
   - Al armar el historial para el agente: sacar `role 'system'` y `blocked`;
     a los de `senderType 'human_agent'` anteponer `'[Asesor] '` al texto
     (solo en la copia que va al agente). `convertToUIMessages` tiene que
     llevar `senderType` en `metadata`.
   - `onFinish`: releer el chat; si `handledBy ≠ 'ai_agent'`, no guardar la
     respuesta y no aplicar `custom_outputs`.

## Group 4: Tests (`unit` = `tests/ai-sdk-provider/`, `routes` = `tests/routes/`)

10. `playwright.config.ts`: `ADVISOR_EMAILS` con `babbage-0..63@example.com`
    (ada = admin, babbage = advisor, curie = customer).
11. Unit: el armado del historial (función pura extraída de `chat.ts`):
    excluye system y blocked, antepone `[Asesor] ` solo a `human_agent`.
12. Routes, con base, en `tests/routes/advisor.test.ts`:
    - curie (customer) → 403 en todas; babbage con `force` → 403.
    - babbage toma → 200, `handledBy human_agent`, `assignedTo` babbage, un
      system "Te atiende un asesor."; tomar de nuevo no duplica el system.
    - otro asesor sobre una tomada → 409 con `assignedTo` (usar ada sin
      force).
    - ada con `force` → reasigna y guarda el system de reasignación.
    - messages: solo quien la tiene tomada (201); el resto 409, incluido un
      admin que no la tomó.
    - el cliente ve el mensaje del asesor con `GET /api/messages/:id?after=`
      y `senderType 'human_agent'`; `after` de otro chat → 400.
    - release `returned_to_agent` → `ai_agent`, sin `assignedTo`; release
      `resolved` → `closedAt`; el cliente escribe → `closedAt` null.
    - un advisor que hace release de una ajena → 409; un admin → 200.
    - después de un turno del asesor, el siguiente request al agente lleva
      `'[Asesor] ...'` y no lleva los system.
    - bandeja: filtros `assignedTo=me`, `status`, `handledBy`.
13. Carrera: routes test con un prompt de mock lento o un hook de test que
    tome la conversación antes de `onFinish`; si no es viable de forma
    determinista, cubrir la decisión con un unit test de la función que decide
    si guardar.
