# Validation: El caso de uso es el de la conversación en curso

La fase está lista para mergear cuando se cumple todo lo que sigue.

## Automated Tests

- [ ] `npm run test:with-db` (base nueva, migrada) y `npm run test:ephemeral`
      en 0
- [ ] `npx tsc --noEmit` y `npm run build:server` en 0

### Specific test coverage required

#### End-to-end

- [ ] Un turno sin caso conserva el caso de la conversación
- [ ] Reabrir un chat cerrado deja `useCase` en `null` hasta el próximo caso
      real, y el `ResolutionEvent` de la conversación cerrada conserva el suyo

## Definition of Done

Todas las casillas marcadas, aprobado por w1:p4 (30-09-26). Sin deploy.
