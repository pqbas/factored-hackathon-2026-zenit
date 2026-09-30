# Plan: Contador de Agente AI por caso de uso

1. `back/packages/db/src/queries.ts`: `ConversationCounts.aiAgentByUseCase` y,
   en `getConversationCounts`, `counts.aiAgentByUseCase[row.useCase] =
   row.aiAgent` para cada fila con caso y conteo mayor que 0.
2. Tests: `tests/routes/reason-filter.test.ts` (agrupado y sin agrupar, la
   conversación en curso por cliente) y `tests/routes/advisor-counts.test.ts`
   (el objeto completo).
