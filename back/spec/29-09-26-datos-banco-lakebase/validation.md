# Validation: Datos del banco desde Lakebase

La fase está lista para mergear cuando se cumple todo lo que sigue.

## Automated Tests

- [ ] `npm run test:with-db` (routes + unit, base nueva con la fixture
      `bank_ro`) en 0
- [ ] `npm run test:ephemeral` en 0
- [ ] `npx tsc --noEmit`, `npm run build:server` y `npm run db:check` en 0
- [ ] `cd front && npm run build` contra la rama
- [ ] `databricks bundle validate` en 0

### Specific test coverage required

#### Unit

- [ ] La configuración del pool del banco toma `BANK_POSTGRES_URL`, después
      `BANK_PGHOST` y después `PGHOST`
- [ ] Los valores de Postgres se convierten a texto (numeric, timestamp,
      null)

#### Integration

- [ ] La fixture `bank_ro` se crea en el Postgres de tests con las siete
      tablas

#### End-to-end

- [ ] `/api/products` devuelve solo tarjetas de crédito y cuentas de ahorro
      activas del cliente de la sesión, con `available_credit`
- [ ] `customer-context` trae customer, profile, interacciones,
      transcripciones enmascaradas y casos desde `bank_ro`
- [ ] Si la consulta del perfil falla, `profile` es `null` y el resto
      responde
- [ ] Las rutas del cliente nunca traen `profile`
- [ ] Un cliente sin datos da listas vacías, no un error
- [ ] Ningún test llama a `/api/2.0/sql/statements`

## Manual Checks

- [ ] `check-keys.sql`: las siete PK son únicas
- [ ] Las siete synced tables quedan en estado sincronizado en
      `bank-assistant-chat-db` y `bank_ro` tiene las mismas filas que el
      origen
- [ ] `setup.sh`: el SP del agente tiene `SELECT` solo en sus tres tablas, el
      del back en las siete, y ninguno tiene otro privilegio en `bank_ro`
- [ ] `refresh.sh` termina, reaplica los grants e imprime la duración
- [ ] `test-freshness.sh` pasa: el refresco trae la fila cambiada y la nueva,
      y deja todo limpio
- [ ] Back local (`:3200`) con `BANK_*` apuntando a Lakebase: la consola
      muestra el contexto de un cliente y `/api/products` responde, sin
      requests a la warehouse en el log
- [ ] Una consulta de movimientos por cliente sobre
      `bank_ro.customer_transactions` usa el índice de la PK (`EXPLAIN`)
- [ ] `docs/datos-banco-lakebase.md` tiene frescura, linaje, la prueba y el
      costo medido de un refresco

## Definition of Done

Todas las casillas marcadas, nombres y roles confirmados con w1:p3, y la spec
revisada por w1:p4 antes de `/spec-implement`. Sin deploy a prod hasta que se
pida.
