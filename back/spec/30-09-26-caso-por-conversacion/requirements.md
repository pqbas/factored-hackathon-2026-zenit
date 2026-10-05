# Requirements: El caso de uso es el de la conversación en curso

Pedido del usuario vía w1:p4 (30-09-26): la consola solo mira la conversación
en curso. `Chat.useCase` ya cumple casi toda la regla:
- el único que lo escribe es `persistAgentReply`, con
  `agentOutputs.useCase ?? undefined`;
- el agente solo manda los 4 casos reales o `null`.

Así, un saludo, el menú, un fuera de alcance, un comercial o un turno
bloqueado nunca lo pisan, y otro caso real sí lo reemplaza. Falta el
reinicio: al reabrir un chat cerrado, el caso de la conversación anterior se
arrastra.

No cambia el esquema ni los contratos.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. Dentro de una conversación, un turno sin caso (`use_case` null) conserva el
   caso anterior, y otro caso real lo reemplaza.
2. Resueltas muestra el caso con el que se cerró cada conversación: lo guarda
   el `ResolutionEvent`.

And it changes in these ways:

3. Cuando un mensaje del cliente reabre un chat cerrado (`reopenChat`), el
   `useCase` vuelve a `null`. La conversación nueva empieza sin caso hasta que
   el agente clasifique uno.

## 2. Decisions

- El reinicio va en `reopenChat` y no al cerrar, así el chat cerrado sigue
  mostrando su caso en la consola hasta que el cliente vuelva a escribir.
- `intent` no se reinicia: lo pisa el turno siguiente, que llega enseguida.
- Daniela quedó en "Otros" porque el agente viejo respondió `intent`
  CASE_STATUS con `use_case` null, no por el back. El agente actual clasifica
  CASE_STATUS, así que no se agrega un mapeo desde el intent.

## 3. Context

- `back/packages/db/src/queries.ts`: `reopenChat`, `updateChatAgentState`.
- `back/server/src/agent-reply.ts`: `persistAgentReply`.
- Coordinación con w1:p6: las secciones de Agente AI salen de `useCase`, y
  sin `useCase` salen del intent. No cambia nada del front.
