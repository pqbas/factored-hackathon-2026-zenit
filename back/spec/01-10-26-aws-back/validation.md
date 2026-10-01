# Validation: Back y front en AWS, con login de demo

## Automated Tests

- [x] `npm run test:with-db` en 0, una sola suite a la vez: 320 passed y 1
      flaky ajeno (supervision). Corrió contra la base de pruebas por un
      relay, porque el puerto :55432 del host sigue roto
- [x] `npx tsc --noEmit` y `npm run build:server` en 0
- [x] `cd front && npm run build` en 0

### Specific test coverage required

#### Unit

- [x] Hash, cookie (válida, alterada, vencida), usuarios inválidos, límite
      de intentos

#### Integration

- [x] Sin capa separada

#### End-to-end

- [x] Sesión sin cookie, login por rol, 401, 429, guard de `/api/*`,
      header falso ignorado, logout
- [x] En modo databricks, login y logout dan 404 y la sesión sale de los
      headers como hoy

## Manual Checks

- [x] La imagen construye y corre en local con `AUTH_MODE=password`: abre el
      login, entra cada usuario y ve lo de su rol
- [x] `docker history` y el repo no tienen secretos
- [x] (Con AWS y el SP) el servicio queda RUNNING, un chat de saldo
      responde, queda en Lakebase y se ve en la consola (chat 8bee121d, 7.2 s;
      admin, asesor y cliente entran con su rol; un header falso da 401)
- [ ] (Con AWS) un segundo deploy no corta `/ping` (pendiente: se mide en
      el primer `deploy.sh` después del merge)
- [x] Prod en Databricks sigue RUNNING y sin cambios

## Definition of Done

Todas las casillas marcadas y la spec revisada por w1:pB antes de crear
recursos en AWS.
