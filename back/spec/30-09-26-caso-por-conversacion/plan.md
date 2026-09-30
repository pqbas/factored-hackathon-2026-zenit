# Plan: El caso de uso es el de la conversación en curso

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `back/packages/db/src/queries.ts` | existente | Modificado: `reopenChat` pone `useCase: null` |
| `back/tests/routes/conversation-state.test.ts` | existente | Modificado: test del reinicio |

## Group 1: Reinicio

1. `back/packages/db/src/queries.ts`, `reopenChat`: `.set({ closedAt: null,
   hadHuman: false, useCase: null })`.

## Group 2: Tests

2. Unit: nada aislable, porque es una sola columna en una query.
3. Integration: sin capa separada.
4. End-to-end: en `back/tests/routes/conversation-state.test.ts`:
   - un turno con caso (`[agent-outputs:…]`), después un turno sin caso: el
     caso se conserva;
   - una despedida cierra el chat y conserva su caso;
   - el mensaje siguiente del cliente lo reabre, y el `useCase` vuelve a
     `null` antes de que el agente clasifique;
   - un turno con otro caso lo llena de nuevo.
