# Validation: El chat del cliente durante un handoff

## Automated Tests

- [x] `npm run build` y `npm test` en `front/`.
- [x] En `back/`, con `front/dist` recién compilado:
      `FRONT_URL=http://localhost:3100 PORT=3100 NODE_ENV=production TEST_MODE=ephemeral PLAYWRIGHT=True npx playwright test tests/e2e --project=e2e`.

### Specific test coverage required

#### Unit
- [x] `isStateOnlyMessage` reconoce el mensaje con solo el estado.
- [x] `mergeNewMessages` no duplica.
- [x] `senderOf` distingue asesor, sistema, cliente y agente, también sin
      `senderType`.
- [x] `handoffNotice` por estado.

#### Integration
- [x] `fetchNewMessages` usa `after` y recarga completo con 400.
- [x] `fetchHandledBy` lee `handledBy` de `/api/chat/:id`.

#### End-to-end
- [x] Mandar un mensaje con la conversación en `human_queue` no deja burbuja
      vacía y muestra el aviso.
- [x] Un mensaje del asesor aparece solo, con "Asesor".
- [x] Cuando vuelve a `ai_agent`, desaparece el aviso.

## Manual Checks

Pendiente hasta que la Fase 5 del back esté en `main`. El flujo se revisó con
el back sirviendo `front/dist` y el chat mockeado en el navegador.
- [ ] Con back, base y agente reales: el cliente pide un asesor, un asesor
      toma la conversación en la consola, responde, y el cliente lo ve en
      menos de 5 s; al devolverla, el agente vuelve a responder.

## Definition of Done
Todas las casillas marcadas y la Fase 5 del back en `main`.
