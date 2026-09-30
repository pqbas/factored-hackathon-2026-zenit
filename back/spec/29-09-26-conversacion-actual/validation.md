# Validation: El agente recibe solo la conversación actual

La fase está lista para mergear cuando se cumple todo lo que sigue.

## Automated Tests

- [ ] `npm run test:with-db` (base nueva, migrada) en 0
- [ ] `npm run test:ephemeral` en 0
- [ ] `npx tsc --noEmit` y `npm run build:server` en 0

### Specific test coverage required

#### Unit

- [ ] `buildAgentHistory` con `since` deja fuera lo anterior al cierre y lo
      del mismo segundo, y mantiene el filtro y el prefijo del asesor

#### Integration

- [ ] Sin capa separada: los caminos se cubren por las rutas (ver
      End-to-end)

#### End-to-end

- [ ] Un chat nunca cerrado manda todo al agente
- [ ] Después de una despedida, el mensaje siguiente llega sin la
      conversación cerrada
- [ ] Después de un Resolver del asesor y la reapertura, llega solo lo
      posterior
- [ ] Un chat devuelto a David sin cierre manda todo, con `[Asesor]`
- [ ] El turno de la cola llega recortado igual que el de vivo

## Manual Checks

- [ ] En un back local contra un agente local, un chat que se despide y
      vuelve a escribir: el agente recibe un `input` de un solo mensaje (log
      del agente o requests capturadas)

## Definition of Done

Todas las casillas marcadas y la spec revisada por w1:p4 antes de
`/spec-implement`.
