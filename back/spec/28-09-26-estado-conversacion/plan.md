# Plan: Estado de la conversación desde las señales del agente

## Code changes

| Module                                              | Origin                        | Change                                                                 |
| --------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| `packages/db/src/schema.ts`                         | —                             | Modified: `Chat.handledBy/useCase/language`, `Message.blocked`; sin `stage` ni `customerName`. |
| `packages/db/migrations/0003_*.sql`                 | —                             | New: generada con `npm run db:generate`.                               |
| `packages/db/src/queries.ts`                        | `updateChatWorkflowState`     | Modified: `updateChatAgentState`, `markMessagesBlocked`, filtros nuevos en `getChats`. |
| `packages/ai-sdk-providers/src/providers-server.ts` | `WorkflowMetadata`            | Modified: `AgentOutputs` y `parseAgentOutputs`; `getAndClearAgentOutputs`. |
| `packages/core/src/ai/providers.ts`                 | —                             | Modified: reexporta lo renombrado.                                     |
| `server/src/routes/chat.ts`                         | —                             | Modified: no llama al agente si `handledBy ≠ ai_agent`; filtra turnos bloqueados; aplica `custom_outputs`. |
| `server/src/routes/history.ts`, `admin.ts`          | —                             | Modified: params `handledBy`/`useCase`; sin `status`/`customer`.       |
| `server/src/routes/internal.ts`, `server/src/index.ts` | —                          | Deleted / Modified: sin la ruta de background check.                   |

---

## Group 1: Base de datos y limpieza del flujo viejo

1. `packages/db/src/schema.ts`:
   - `chat`: agregar `handledBy: varchar('handledBy', { enum: ['ai_agent',
     'human_queue', 'human_agent'] }).notNull().default('ai_agent')`,
     `useCase: varchar('useCase', { length: 128 })` y
     `language: varchar('language', { length: 16 })`. Borrar `stage` y
     `customerName`; `intent` se queda.
   - `message`: agregar `blocked: boolean('blocked').notNull().default(false)`.

2. `npm run db:generate`: revisar que el SQL sea solo los ADD COLUMN y los
   DROP COLUMN esperados. Commitear el SQL y `meta/`.

3. `packages/db/src/queries.ts`:
   - Reemplazar `updateChatWorkflowState` por `updateChatAgentState({ chatId,
     useCase?, intent?, language?, handledBy? })`, que actualiza solo los
     campos que vienen.
   - Nueva `markMessagesBlocked({ ids: string[] })`.
   - `getChats`: quitar `status` y `customer` (y el tipo `ChatStatusFilter`);
     agregar `handledBy?` y `useCase?` como igualdad.

4. Borrar `server/src/routes/internal.ts` y su `app.use` en
   `server/src/index.ts`.

---

## Group 2: Rutas

5. `server/src/routes/history.ts` y `server/src/routes/admin.ts`: leer
   `handledBy` y `useCase` de la query en lugar de `status` y `customer`.

6. `server/src/routes/chat.ts`, antes de llamar al agente:
   - Si hay base, el chat existe y `chat.handledBy !== 'ai_agent'`: guardar el
     mensaje del cliente (ya pasa) y responder con `createUIMessageStream` que
     escribe una sola parte
     `{ type: 'data-conversation-state', data: { handledBy } }`, sin llamar a
     `streamText` y sin guardar mensaje del asistente en `onFinish`.
   - Sumar `conversation-state: { handledBy: string }` a `CustomUIDataTypes`
     en `packages/core/src/types.ts`.

7. `server/src/routes/chat.ts`, al armar el historial: excluir de
   `uiMessages` los mensajes con `blocked = true` antes de
   `convertToModelMessages` (solo con base; `convertToUIMessages` tiene que
   llevar `blocked` en `metadata`).

---

## Group 3: Señales del agente (depende del contrato confirmado)

8. `packages/ai-sdk-providers/src/providers-server.ts`:
   - Reemplazar `WorkflowMetadata` por `AgentOutputs` (`useCase`, `intent`,
     `language`, `blocked`, `handoff`) y una función pura
     `parseAgentOutputs(raw: unknown): AgentOutputs` que ignora campos
     ausentes o de otro tipo.
   - Renombrar `getAndClearWorkflowMetadata` a `getAndClearAgentOutputs`;
     reexportar en `packages/core/src/ai/providers.ts`.

9. `server/src/routes/chat.ts` `onFinish`:
   - `updateChatAgentState` con `useCase`, `intent` y `language`.
   - Si `blocked`: `markMessagesBlocked` con el id del mensaje del cliente y
     el de la respuesta, y guardar la respuesta con `blocked: true`.
   - Si `handoff`: `handledBy: 'human_queue'`.

---

## Group 4: Tests

Proyectos de Playwright `unit` (`tests/ai-sdk-provider/`) y `routes`
(`tests/routes/`).

10. Unit, en `tests/ai-sdk-provider/agent-outputs.test.ts`: `parseAgentOutputs`
    con la forma completa, con campos ausentes, con tipos inválidos y con
    `handoff` nulo y con valor.

11. Mock: en `tests/api-mocking/api-mock-handlers.ts`, un prompt de prueba que
    haga que el mock de `/responses` devuelva `custom_outputs` con
    `blocked: true`, otro con `handoff`, y uno normal con `use_case`, `intent`
    y `language`.

12. Integration, en `tests/routes/conversation-state.test.ts` (con base):
    - Un turno normal guarda `useCase`, `intent` y `language` en el chat.
    - Un turno bloqueado marca los dos mensajes, y el turno siguiente no los
      manda al agente (request capturado).
    - Un turno con `handoff` deja el chat en `human_queue`.
    - Un chat en `human_queue` guarda el mensaje del cliente, no llama al
      agente (sin request capturado), responde la parte
      `data-conversation-state` y no guarda mensaje del asistente.
    - `/api/history?handledBy=human_queue` y `?useCase=` filtran.

13. End-to-end, en el mismo archivo y en `tests/routes/history.test.ts`:
    - `?status=` y `?customer=` ya no filtran nada (se ignoran).
    - `POST /api/internal/background-check-received` responde 404.
