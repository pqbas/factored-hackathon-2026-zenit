# Plan: El idioma elegido por el cliente llega al agente

1. `packages/core/src/schemas/chat.ts`: `language` opcional en el body.
2. `packages/ai-sdk-providers/src/providers-server.ts`:
   `CONTEXT_HEADER_LANGUAGE`, que `databricksFetch` pasa a
   `custom_inputs.language` (mismo patrón que `handled_by`). Se exporta desde
   `core/src/ai/providers.ts`.
3. `server/src/agent-reply.ts`: `streamAgentTurn` recibe `language` y manda el
   header si viene.
4. `server/src/routes/chat.ts`: normaliza a `'es' | 'pt' | null` y lo pasa a
   `streamAgentTurn` y a `enqueueAgentTurn`.
5. `packages/db/src/schema.ts`: `AgentTurn.language` (migración).
   `enqueueAgentTurn` lo guarda y `agent-queue.ts` lo pasa al reintento.
6. Tests (`tests/routes/context-injection.test.ts` y `agent-queue.test.ts`):
   - `es` y `pt` llegan como `custom_inputs.language`;
   - un valor inválido o ausente no manda la clave;
   - un turno encolado llega al reintento con su idioma.
