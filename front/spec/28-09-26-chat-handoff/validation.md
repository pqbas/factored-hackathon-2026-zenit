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

Hecho con el back de `main` (PR #22) en :3200, `chatbot_dev`, el agente real y
el front de las ramas 7 + 1c juntas:

- [x] El cliente habla con David; asesor1 toma la conversación y el cliente lo
      nota sin escribir (aviso "Te atiende un asesor.", encabezado "Asesor").
- [x] Las respuestas del asesor y del admin llegan como "Asesor", sin email
      (`senderId` null en `/api/messages`).
- [x] Al devolverla a David, desaparece el aviso, llega "Volviste con David." y
      el siguiente turno lo responde el agente.

## Definition of Done
Todas las casillas marcadas y la Fase 5 del back en `main`.
