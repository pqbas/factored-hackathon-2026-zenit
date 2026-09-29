# Validation: Datos principales del cliente en el panel de contexto

La fase está lista para mergear cuando se cumple todo lo que sigue.

## Automated Tests

- [ ] `npm run test:with-db` (routes + unit, base nueva) en 0
- [ ] `npm run test:ephemeral` (routes + unit) en 0
- [ ] `npx tsc --noEmit` y `npm run build:server` en 0
- [ ] `cd front && npm run build` contra la rama

### Specific test coverage required

#### Unit

- [ ] Sin lógica pura nueva: el mapeo se cubre por la ruta

#### Integration

- [ ] Sin capa separada (ver End-to-end)

#### End-to-end

- [ ] `customer-context` trae `profile` con `customerId`, `country`, `city`,
      `segment`, `status`, `customerSince`, `products` (`productType`,
      `last4`), `contact` (`email`, `mobilePhone`) y `preferredChannel`
- [ ] `customer`, `interactions`, `transcripts` y `cases` no cambian
- [ ] Un campo vacío del banco llega como `null`, no como string vacío
- [ ] `/api/chat/:id`, `/api/history` y `/api/products` no traen `profile`
- [ ] Un cliente sigue recibiendo 403

## Manual Checks

- [ ] La consulta del perfil corre contra el warehouse real para Santiago y
      trae Tijuana, México, Plus, Active, alta 2022-07-03, Phone, su email y
      sus productos activos
- [ ] En `:3200`, `customer-context` de un chat sembrado trae `profile`

## Post-deploy Checks

- [ ] En el despliegue se corre `back/scripts/uc-grants.sh` con el SP de la
      App; después del redeploy, `customer-context` en la App trae
      `profile` sin 502 en los logs

## Definition of Done

Todas las casillas marcadas, el contrato enviado a w1:p6 y el spec revisado
por w1:p4 antes de `/spec-implement`.
