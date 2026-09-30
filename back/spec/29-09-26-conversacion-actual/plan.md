# Plan: El agente recibe solo la conversación actual

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `back/packages/db/src/queries.ts` | existente | Modificado: `getLastResolutionAt` |
| `back/server/src/agent-turn.ts` | existente | Modificado: `buildAgentHistory` recibe `since` |
| `back/server/src/agent-reply.ts` | existente | Modificado: `streamAgentTurn` corta en el último cierre |
| `back/tests/ai-sdk-provider/agent-turn.test.ts` | existente | Modificado: casos de `since` |
| `back/tests/routes/current-conversation.test.ts` | — | Nuevo |

---

## Group 1: Corte en el último cierre

1. `back/packages/db/src/queries.ts`: `getLastResolutionAt({ chatId })`.
   - Devuelve `max(resolvedAt)` de `ResolutionEvent` del chat, o `null`.
   - Sin base: `null`.

2. `back/server/src/agent-turn.ts`: `buildAgentHistory(messages, since?)`.
   - Con `since`, deja solo los mensajes con `metadata.createdAt` posterior a
     `since`.
   - Después aplica el filtro y el prefijo de hoy.
   - Sin `since`, igual que hoy.

3. `back/server/src/agent-reply.ts`, en `streamAgentTurn`:
   - lee `getLastResolutionAt({ chatId })` y lo pasa a `buildAgentHistory`;
   - si la consulta falla, `console.warn` y sigue sin corte.
   - `chat.ts` y `agent-queue.ts` no cambian: los dos llaman a
     `streamAgentTurn`.

---

## Group 2: Tests

4. Unit: ampliar `back/tests/ai-sdk-provider/agent-turn.test.ts`:
   - `since` deja fuera los mensajes anteriores y los del mismo segundo que
     el cierre;
   - sin `since`, todo;
   - el filtro de bloqueados y sistema, y el prefijo del asesor, siguen
     aplicando sobre lo que queda.

5. Integration: el proyecto no tiene una capa separada. Los caminos se
   cubren de punta a punta (paso 6).

6. End-to-end: crear `back/tests/routes/current-conversation.test.ts`, con
   base real, MSW y requests capturadas. Casos:
   - chat nunca cerrado: el agente recibe todos los mensajes;
   - después de una despedida (`[agent-outputs:goodbye]`, que deja un
     `ResolutionEvent`), el mensaje siguiente del cliente llega solo, sin
     los de la conversación cerrada;
   - un chat resuelto por el asesor y reabierto por el cliente manda solo lo
     posterior al Resolver;
   - un chat devuelto a David (`returned_to_agent`, sin cierre) manda todo,
     incluidos los mensajes del asesor con `[Asesor]`;
   - el turno de la cola también llega recortado
     (`[agent-down-1:…]` después de un cierre).
