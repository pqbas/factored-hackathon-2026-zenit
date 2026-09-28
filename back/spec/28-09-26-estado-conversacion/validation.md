# Validation: Estado de la conversación desde las señales del agente

La fase está lista para mergear cuando se cumple todo lo que sigue y el agente
confirmó el contrato de `custom_outputs` (requirements §1).

## Automated Tests

- [ ] `npm run test:ephemeral` termina en 0, sin fallos
- [ ] `npm run test:with-db` termina en 0 contra Postgres local
- [ ] `npm run lint`, `npx tsc --noEmit` y `npm run build:server` sin errores
- [ ] `npm run db:check` sin inconsistencias; `npm run db:migrate` sobre una
      base con datos de la Fase 2 no falla

### Specific test coverage required

#### Unit

- [ ] `parseAgentOutputs` lee la forma completa del contrato
- [ ] `parseAgentOutputs` ignora campos ausentes o con otro tipo

#### Integration

- [ ] Un turno normal guarda `useCase`, `intent` y `language`
- [ ] Un turno bloqueado marca los dos mensajes y no se reenvía al agente
- [ ] Un turno con `handoff` deja el chat en `human_queue`
- [ ] Un chat en `human_queue` no llama al agente, responde
      `data-conversation-state` y no guarda mensaje del asistente
- [ ] `/api/history` filtra por `handledBy` y por `useCase`

#### End-to-end

- [ ] `status` y `customer` se ignoran en `/api/history`
- [ ] `POST /api/internal/background-check-received` responde 404

## Manual Checks

Con Postgres local y el agente real (`API_PROXY`):

- [ ] Un chat con `demo-mx-1` preguntando por el saldo deja `useCase` e
      `intent` en la base
- [ ] Poner a mano `handledBy = 'human_queue'` en un chat y escribir → el
      mensaje se guarda, el agente no recibe el request (log) y no aparece
      respuesta
- [ ] Un mensaje que el agente bloquea (guardrail) queda con `blocked = true`,
      y el siguiente request al agente no lo lleva en `input`

## Definition of Done

Todas las casillas marcadas, contrato confirmado por el agente, y los cambios de
params y forma de `Chat` avisados al front.
