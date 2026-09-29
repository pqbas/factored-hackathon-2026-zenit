# Plan: David se pausa después de derivar

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `back/packages/db/src/queries.ts` | existente | Modificado: `cancelAgentTurns`, `hasOpenHandoff`, `hasPendingAgentTurn` reutilizado |
| `back/packages/ai-sdk-providers/src/providers-server.ts` | existente | Modificado: cabecera `handled_by` → `custom_inputs.handled_by`; `paused` en `parseAgentOutputs` |
| `back/server/src/agent-reply.ts` | existente | Modificado: pausa en `persistAgentReply`, recorte tras la derivación, `handledBy` en `streamAgentTurn`, cancelación al derivar |
| `back/server/src/agent-turn.ts` | existente | Modificado: `isPaused` y `trimAfterHandoff` (funciones puras) |
| `back/server/src/routes/chat.ts` | existente | Modificado: pausa por handoff abierto y encolado de turnos concurrentes |
| `back/server/src/agent-queue.ts` | existente | Modificado: pausa antes de llamar al agente; el vencimiento abre handoff `agent_unavailable` |
| `back/server/src/routes/advisor.ts` | existente | Modificado: take cancela turnos pendientes |
| `back/tests/api-mocking/api-mock-handlers.ts` | existente | Modificado: marcadores `[agent-slow:ms]`, salidas `paused` y `complaintThenText` |
| `back/tests/routes/pause-after-handoff.test.ts` | — | Nuevo |
| `back/tests/ai-sdk-provider/agent-turn.test.ts` | existente | Modificado: `isPaused` y `trimAfterHandoff` |

---

## Group 1: Datos y contrato con el agente

1. `back/packages/db/src/queries.ts`:
   - `cancelAgentTurns({ chatId })`: `update AgentTurn set status='discarded'
     where chatId = … and status = 'pending'`.
   - `hasOpenHandoff({ chatId })`: `exists` sobre `Handoff` con
     `resolvedAt is null`.

2. `back/packages/ai-sdk-providers/src/providers-server.ts`:
   - Nueva `CONTEXT_HEADER_HANDLED_BY`. `databricksFetch` la saca de las
     cabeceras y la inyecta como `body.custom_inputs.handled_by`, igual que
     `session_token`.
   - `AgentOutputs.paused?: boolean`, leído de `raw.paused` en
     `parseAgentOutputs`.

---

## Group 2: Reglas puras

3. `back/server/src/agent-turn.ts`:
   - `isPaused({ handledBy, hasOpenHandoff })`: `true` si `handledBy !==
     'ai_agent'` o hay un handoff abierto. Reemplaza el uso de
     `shouldPersistAgentReply` en los caminos de guardado.
   - `trimAfterHandoff(parts)`: devuelve las partes hasta la primera parte de
     texto que contiene una frase de derivación (`HANDOFF_PHRASES`: la de
     español y la de portugués de `agent/src/prompts/messages.py`), inclusive.
     Si ninguna la contiene, devuelve las partes sin cambios. También corta
     texto pegado después de la frase dentro de la misma parte.

---

## Group 3: Caminos del back

4. `back/server/src/agent-reply.ts`:
   - `streamAgentTurn` recibe `handledBy` y lo manda en
     `CONTEXT_HEADER_HANDLED_BY`.
   - `persistAgentReply`:
     - Antes de guardar, lee chat y handoff abierto. Si `isPaused` o si
       `agentOutputs.paused`, no guarda nada, descarta los outputs y devuelve
       `false`.
     - Con `agentOutputs.handoff`, guarda `reply.parts` pasadas por
       `trimAfterHandoff` y, después de `openHandoff`, llama a
       `cancelAgentTurns({ chatId })`.

5. `back/server/src/routes/chat.ts`:
   - El chequeo actual (`chat.handledBy !== 'ai_agent'`) pasa a `isPaused`
     con `hasOpenHandoff`, y responde el mismo stream de estado.
   - Nuevo chequeo antes de llamar al agente: si hay un mensaje del cliente y
     (`streamCache.getActiveStreamId(id)` o `hasPendingAgentTurn`), se encola
     con `enqueueAgentTurn` y se responde `start` + `data-agent-pending
     { messageId }` + `finish`, sin llamar al agente.
   - Pasa `chat?.handledBy ?? 'ai_agent'` a `streamAgentTurn`.

6. `back/server/src/agent-queue.ts`:
   - `processAgentTurn`: reemplaza el chequeo de `handledBy` por `isPaused`
     (con `hasOpenHandoff`) antes de llamar al agente. Pasa `handledBy` a
     `streamAgentTurn`.
   - Si `persistAgentReply` devuelve `false` porque el agente respondió
     `paused`, el turno se cierra como `discarded`, no como `done`.
   - `expire`: además del aviso y de `human_queue`, abre un handoff
     `{ reason: 'agent_unavailable', summary: null, facts: null }` con
     `openHandoff`.

7. `back/server/src/routes/advisor.ts`: en `POST /conversations/:id/take`,
   después de un take exitoso, `cancelAgentTurns({ chatId })`.

---

## Group 4: Tests

8. Unit: ampliar `back/tests/ai-sdk-provider/agent-turn.test.ts`:
   - `isPaused` en sus cuatro combinaciones.
   - `trimAfterHandoff` corta las partes posteriores, corta el texto pegado
     después de la frase en la misma parte, funciona en portugués y deja las
     partes intactas si no hay frase.

9. Integration: el proyecto no tiene una capa separada. Los caminos se prueban
   de punta a punta con las rutas, la base real y MSW (paso 10).

10. End-to-end: crear `back/tests/routes/pause-after-handoff.test.ts`. En el
    mock (`api-mock-handlers.ts`) se suman el marcador `[agent-slow:<ms>]`,
    que demora la respuesta, y las salidas `paused` (sin ítems de texto) y
    `complaintThenText` (derivación con texto después). Casos, uno por
    camino:
    - Handoff cancela la cola: con un turno encolado detrás, el turno que
      deriva deja `['done', 'discarded']` y un solo mensaje de David.
    - Turnos concurrentes: un segundo mensaje mientras el primero (lento)
      deriva se encola, responde `data-agent-pending` y termina `discarded`,
      sin mensaje de David.
    - Take cancela la cola: un turno pendiente queda `discarded` apenas un
      asesor toma el chat.
    - Handoff abierto pausa aunque `handledBy` sea `ai_agent`: el back no
      llama al agente (requests capturadas).
    - `paused=true` del agente: no se guarda mensaje ni se aplican outputs.
    - `custom_inputs.handled_by` viaja en cada llamada (requests capturadas).
    - Texto después de la derivación: el mensaje guardado termina en "Te
      comunico con un asesor…".
    - Vencimiento: el turno vencido deja un handoff abierto `agent_unavailable`
      (ampliar `agent-queue.test.ts`).
