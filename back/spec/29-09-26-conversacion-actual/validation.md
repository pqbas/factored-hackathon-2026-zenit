# Validation: El agente recibe solo la conversación actual

La fase está lista para mergear cuando se cumple todo lo que sigue.

## Automated Tests

- [x] `npm run test:with-db` (base nueva, migrada) en 0
- [x] `npm run test:ephemeral` en 0
- [x] `npx tsc --noEmit` y `npm run build:server` en 0

### Specific test coverage required

#### Unit

- [x] `buildAgentHistory` con `since` deja fuera lo anterior al cierre y lo
      del mismo segundo, y mantiene el filtro y el prefijo del asesor

#### Integration

- [x] Sin capa separada: los caminos se cubren por las rutas (ver
      End-to-end)

#### End-to-end

- [x] Un chat nunca cerrado manda todo al agente
- [x] Después de una despedida, el mensaje siguiente llega sin la
      conversación cerrada
- [x] Después de un Resolver del asesor y la reapertura, llega solo lo
      posterior
- [x] Un chat devuelto a David sin cierre manda todo, con `[Asesor]`
- [x] El turno de la cola llega recortado igual que el de vivo

## Manual Checks

- [x] Un chat que se despide y vuelve a escribir: el agente recibe un `input`
      de un solo mensaje (requests capturadas en `current-conversation.test.ts`;
      no se corrió contra un agente real para no gastar cuota de Qwen)

## Definition of Done

Todas las casillas marcadas y la spec revisada por w1:p4 antes de
`/spec-implement`.
