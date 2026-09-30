# Requirements: El agente recibe solo la conversación actual

Decisión del usuario, pedida por w1:p3 y aprobada por w1:p4 (29-09-26): David
lee la conversación actual, no el chat entero.

Un chat puede tener varias conversaciones. Cada cierre deja un
`ResolutionEvent` (despedida con David atendiendo, o Resolver del asesor), y
un mensaje nuevo del cliente reabre el chat. Hoy el back manda al agente todo
el chat. Después de esta fase manda solo lo posterior al último cierre.

No cambia el esquema de la base ni el contrato con el front. Con el agente
tampoco hay campos nuevos: el `input` lleva menos mensajes. w1:p3 confirmó que
el agente usa todo lo que recibe.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. El historial que va al agente sigue sin mensajes de sistema ni bloqueados,
   y los del asesor van con su prefijo `[Asesor]`.
2. Un chat que nunca se cerró manda todo su historial, como hoy.
3. La cola de turnos, la pausa tras derivar y `custom_inputs` (`session_token`
   y `handled_by`) no cambian.

And it changes in these ways:

4. El `input` que el back manda al agente lleva solo los mensajes creados
   después del último cierre del chat, es decir, el `resolvedAt` más reciente
   de sus `ResolutionEvent`. Si el chat nunca se cerró, lleva todo.
5. Un chat que un asesor devuelve a David sin cerrarlo (release
   `returned_to_agent`) sigue siendo la misma conversación: no deja
   `ResolutionEvent` y va entero.
6. Aplica igual en el camino en vivo (`POST /api/chat`) y en la cola de turnos
   (`agent-queue.ts`).

## 2. Decisions

- En `input` va solo la conversación actual, en vez de mandar el índice
  `custom_inputs.conversation_start` que se pidió primero.
  - El provider de Databricks convierte cada parte de texto de un mensaje de
    David en un item de `input` aparte.
  - Un índice calculado sobre los mensajes del chat no coincide con el
    `input`, y calcularlo sobre el `input` ata al back a esa conversión.
  - Recortar no depende de eso y además baja tokens y costo.
  - w1:p3 lo aceptó: el respond tampoco necesita las conversaciones cerradas,
    y la detección de pausa ya no puede confundirse con una derivación de una
    conversación vieja.
- El corte se hace en `streamAgentTurn`, el único punto por el que pasan los
  dos caminos (en vivo y cola), con una sola consulta al último `resolvedAt`
  del chat.
- `metadata.createdAt` llega con precisión de segundos (`formatISO`), y
  `resolvedAt` en milisegundos.
  - La respuesta de despedida se guarda antes del cierre, así que queda
    fuera, que es lo correcto.
  - Solo quedaría mal un mensaje del cliente guardado en el mismo segundo que
    el cierre. No pasa en la práctica: el cierre llega al final del turno.
- Si la consulta del último cierre falla, se manda el historial entero, como
  hoy, y se deja un warning. Mandar de más es mejor que dejar sin responder.
- Fuera de alcance: resumir las conversaciones cerradas para el agente.

## 3. Context

- `agent/spec/29-09-26-eval-fixes/requirements.md` §6 (rama
  `feat/pqbas-agent-eval-fixes`): el pedido de w1:p3.
- Patrones existentes:
  - `back/server/src/agent-turn.ts`: `buildAgentHistory`, funciones puras.
  - `back/server/src/agent-reply.ts`: `streamAgentTurn`.
  - `back/packages/db/src/queries.ts`: `resolveChatByAgent`, `releaseChat`
    (insertan `ResolutionEvent`).
  - `back/tests/routes/pause-after-handoff.test.ts`: requests al agente
    capturadas (`/api/test/captured-requests`).
