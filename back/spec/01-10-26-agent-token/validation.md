# Validation: El back llama al agente de AWS con un token compartido

## Automated Tests

- [x] `npm run test:with-db` en 0, una sola suite a la vez (324 passed)
- [x] `npx tsc --noEmit` y `npm run build:server` en 0

### Specific test coverage required

#### Unit

- [x] Sin token va `Authorization`; con token y `API_PROXY` va solo
      `x-agent-token`; con token y sin `API_PROXY` el secreto no viaja

#### Integration

- [x] Sin capa separada

#### End-to-end

- [x] La suite existente pasa (camino sin token)

## Manual Checks

- [x] El SP del agente de AWS tiene en Lakebase solo SELECT en las 3 tablas
      de `bank_ro` y en `sim_sessions`
- [ ] (Cuando el agente de AWS esté arriba) `setup.sh agent <url>` y un chat
      de saldo en AWS responde con el agente de AWS

## Definition of Done

Todas las casillas marcadas, salvo la última, que depende del agente de AWS.
