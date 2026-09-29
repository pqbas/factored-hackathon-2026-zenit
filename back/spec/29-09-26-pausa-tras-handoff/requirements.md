# Requirements: David se pausa después de derivar

Regla permanente del usuario (vía w1:p4): cuando David deriva una
conversación a un asesor, el agente se pausa en esa conversación y no dice nada
más hasta que un humano la devuelva. El usuario vio casos donde David siguió
hablando después de derivar.

Esta fase cierra, del lado del back, todos los caminos por los que eso puede
pasar, con un test por camino. El lado del agente (terminar el grafo después
de derivar, no responder si el historial ya tiene la derivación) lo hace w1:p3
en paralelo, con el contrato del punto 8.

No cambia el esquema de la base ni los contratos con el front.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. Un chat en `human_queue` o `human_agent` guarda los mensajes del cliente y
   no llama al agente. Responde solo con el estado de la conversación.
2. Si un asesor toma el chat mientras David responde, esa respuesta no se
   guarda.
3. Devolver a David (release `returned_to_agent`) cierra el handoff y David
   vuelve a responder desde el siguiente mensaje del cliente.
4. La cola de turnos (`AgentTurn`) sigue respondiendo cuando el agente vuelve,
   y vence a los 20 minutos con un aviso.

And it changes in these ways:

5. Una conversación está pausada si tiene un handoff abierto o si su
   `handledBy` no es `ai_agent`. En una conversación pausada el back no llama
   al agente, no guarda ninguna respuesta de David y no la cuenta como turno
   respondido, venga del camino en vivo, de la cola o de un reintento.
6. Cuando entra un handoff (la respuesta de David trae `custom_outputs.handoff`)
   o un asesor toma el chat, los turnos pendientes de ese chat en `AgentTurn`
   se cancelan (`discarded`) en el acto, sin esperar a que el worker los tome.
7. Los turnos de un mismo chat van de a uno.
   - Si llega un mensaje del cliente mientras David todavía responde el
     anterior, o mientras ese chat tiene un turno pendiente en la cola, el
     mensaje se guarda y su turno se encola, en vez de llamar al agente en
     paralelo.
   - El stream responde `start` + `data-agent-pending` + `finish`, igual que
     cuando el agente no está disponible.
   - Si el turno anterior terminó en derivación, el turno encolado se cancela
     por el punto 6 y David no dice nada más.
8. Contrato con el agente (acordado con w1:p3):
   - El back manda `custom_inputs.handled_by` (el `handledBy` del chat) en
     cada llamada, junto a `session_token`.
   - Si el agente responde un turno pausado, sin ítems de texto y con
     `custom_outputs.paused = true`, el back no guarda mensaje, no aplica el
     resto de `custom_outputs` y no cierra el turno de la cola como respondido.
9. Si en el mismo turno de la derivación llega texto después del mensaje de
   derivación, el back guarda el mensaje de David solo hasta el mensaje de
   derivación inclusive: "Te comunico con un asesor…" en español o "Vou
   transferir você para um atendente…" en portugués.
10. Cuando un turno de la cola vence, el chat pasa a `human_queue` con un
    handoff abierto de motivo `agent_unavailable`, además del aviso. Así la
    pausa y la bandeja se explican igual que en una derivación.

## 2. Decisions

- "Pausada" se define por un handoff abierto o un `handledBy` distinto de
  `ai_agent`, porque el handoff es el registro de la derivación. Los dos
  cambian juntos al derivar y al devolver, pero chequear los dos cubre datos
  inconsistentes (por ejemplo, un chat de antes de la tabla Handoff).
- Los turnos concurrentes se encolan en vez de rechazarse, porque el mensaje
  del cliente no se puede perder. La cola ya existe y ya respeta el orden por
  chat. Para saber si hay un turno en curso se usa el stream activo en memoria
  (`StreamCache`), porque el back corre como un único proceso; si ese estado se
  pierde, el turno igual se responde por la cola.
- El recorte del punto 9 se hace por la frase fija de derivación del agente
  (`agent/src/prompts/messages.py`), porque es el único marcador confiable de
  dónde termina el mensaje de derivación. Si la frase no está, se guarda todo.
  El recorte solo corrige lo que queda guardado. Lo que ya se transmitió en
  vivo no se puede retirar, y por eso la causa se cierra en el agente (w1:p3).
- El vencimiento abre un handoff `agent_unavailable` en vez de dejar el chat en
  `human_queue` sin handoff, porque así queda pausado por la misma regla, se
  cierra al resolver o devolver, y aparece en `byHandoffReason` como clave
  extra.
- Los chats de Santiago y Javier en `human_queue` sin fila en Handoff son dato
  viejo, no un camino abierto. Derivaron entre las 04:40 y las 05:04 UTC del
  29/09, cuando `:3200` todavía corría #68, sin la tabla Handoff (migración
  0010, #71 a las 05:14). Todos los que derivaron después tienen su fila, y
  la limpieza de `chatbot_dev` que aprobó el usuario los borra.
- Fuera de alcance / futuro: retirar del chat del cliente un texto ya
  transmitido, y coordinar turnos entre varias instancias del back.

## 3. Context

- `docs/flujo-atencion.md`: etapa 5 (derivación: David deja de responder).
- Patrones existentes:
  - `back/server/src/routes/chat.ts`: chequeo `chat.handledBy !== 'ai_agent'`
    antes de llamar al agente, flujo de `data-agent-pending` y `StreamCache`.
  - `back/server/src/agent-reply.ts`: `persistAgentReply` (descarte si ya no
    es `ai_agent`, `openHandoff`) y `streamAgentTurn`.
  - `back/server/src/agent-queue.ts`: `processAgentTurn` y `expire`.
  - `back/packages/ai-sdk-providers/src/providers-server.ts`: `databricksFetch`
    (inyección de `custom_inputs` por cabeceras) y `parseAgentOutputs`.
  - `back/packages/db/src/queries.ts`: `enqueueAgentTurn`, `finishAgentTurn`,
    `takeChat`, `openHandoff`, `getLatestHandoffs`.
  - `agent/src/prompts/messages.py`: frases de derivación en es y pt.
