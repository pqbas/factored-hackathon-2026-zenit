# Requirements: "David está escribiendo" durante toda la espera

En el chat del cliente, después de enviar un mensaje, el indicador de que David está escribiendo tiene que verse desde el envío hasta que aparece el primer texto de la respuesta, sin huecos. Hoy hay tramos de la espera sin ningún indicador (reportado por el usuario en prod de AWS).

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. El indicador aparece mientras la respuesta está en camino por el stream del POST (`submitted`, y `streaming` sin texto todavía), con el texto "David está consultando tus datos…" a los 3 s.
2. Con la conversación en manos de un asesor (en espera o atendida), no aparece el indicador de David.
3. Con David sin responder (turno en cola), el header sigue diciendo "No disponible".

And it changes in these ways:

4. El indicador sigue visible después del primer evento del stream (`start`), cuando el mensaje de David ya existe pero todavía no tiene texto. Es el hueco que vio el usuario: 2.6 s de los 3.3 s de espera.
5. El indicador también se ve cuando el turno quedó en cola y la respuesta llega después por polling.
6. Un mensaje de David sin texto no muestra acciones (copiar).
7. Hay un solo indicador a la vez.

## 2. Decisions

- Causa reproducida (01/10) con la secuencia que w1:pC midió en AWS: `start` con `messageId` a los 0.7 s, 2.6 s sin ningún chunk, y después todo el texto en un solo `text-delta`. Con un servidor de prueba que hace ese mismo stream, el DOM queda 2.6 s con el mensaje de David ya creado y sin indicador.
  - El `start` crea el mensaje del asistente, pero el estado del chat sigue en `submitted`; no pasa a `streaming` hasta que llega contenido.
  - El indicador del mensaje (`awaitingText`) exige `streaming`, y el indicador de la lista (`AwaitingResponseMessage`) exige que el último mensaje sea del cliente. En ese tramo no se cumple ninguna de las dos condiciones.
- Hay un segundo hueco, de la misma familia: el turno en cola (`start` + `data-agent-pending` + `finish`). El estado pasa a `ready` y nada indica que David va a responder hasta que el polling trae el mensaje. Solo ocurre cuando el agente falla o llega un segundo mensaje mientras David contesta (w1:pC).
- Una sola regla decide la espera, en lugar de condiciones repartidas. David debe una respuesta si atiende el chat y se cumple una de dos:
  - la respuesta está en curso (`submitted` o `streaming`) y todavía no hay texto suyo;
  - el turno está en cola (`agentPending`) y el último mensaje es del cliente.
- El indicador se muestra dentro del mensaje de David si ya existe, y al final de la lista si todavía no. Nunca los dos a la vez.
- Un mensaje de David sin texto no muestra acciones, esté o no cargando.
- En cola se muestra el indicador aunque el header diga "No disponible": el turno no se pierde y David responde solo.

## 3. Context

- `src/components/messages.tsx`, `message.tsx` (`awaitingText`, `AwaitingResponseMessage`), `message-actions.tsx`, `chat.tsx` (`agentPending`, `handledBy`), `src/lib/handoff.ts`.
- Back: `back/server/src/routes/chat.ts` (el stream de un turno en cola).
