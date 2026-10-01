# Validation: Back y front en AWS, con login de demo

## Automated Tests

- [ ] `npm run test:with-db` en 0, una sola suite a la vez (necesita el
      Postgres de pruebas, hoy roto hasta que se reinicie Docker)
- [ ] `npx tsc --noEmit` y `npm run build:server` en 0
- [ ] `cd front && npm run build` en 0

### Specific test coverage required

#### Unit

- [ ] Hash, cookie (válida, alterada, vencida), usuarios inválidos, límite
      de intentos

#### Integration

- [ ] Sin capa separada

#### End-to-end

- [ ] Sesión sin cookie, login por rol, 401, 429, guard de `/api/*`,
      header falso ignorado, logout
- [ ] En modo databricks, login y logout dan 404 y la sesión sale de los
      headers como hoy

## Manual Checks

- [ ] La imagen construye y corre en local con `AUTH_MODE=password`: abre el
      login, entra cada usuario y ve lo de su rol
- [ ] `docker history` y el repo no tienen secretos
- [ ] (Con AWS y el SP) el servicio queda RUNNING, un chat de saldo
      responde, queda en Lakebase y se ve en la consola
- [ ] (Con AWS) un segundo deploy no corta `/ping`
- [ ] Prod en Databricks sigue RUNNING y sin cambios

## Definition of Done

Todas las casillas marcadas y la spec revisada por w1:pB antes de crear
recursos en AWS.
