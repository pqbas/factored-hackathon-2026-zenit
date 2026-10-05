# Validation: Datos del banco desde Lakebase

La fase está lista para mergear cuando se cumple todo lo que sigue.

## Automated Tests

- [x] `npm run test:with-db` (routes + unit, base nueva con la fixture
      `bank_ro`) en 0
- [x] `npm run test:ephemeral` en 0
- [x] `npx tsc --noEmit`, `npm run build:server` y `npm run db:check` en 0
- [x] `cd front && npm run build` contra la rama
- [x] `databricks bundle validate` en 0

### Specific test coverage required

#### Unit

- [x] La configuración del pool del banco toma `BANK_POSTGRES_URL`, después
      `BANK_PGHOST` y después `PGHOST`
- [x] Los valores de Postgres se convierten a texto (numeric, timestamp,
      null)

#### Integration

- [x] La fixture `bank_ro` se crea en el Postgres de tests con las siete
      tablas

#### End-to-end

- [x] `/api/products` devuelve solo tarjetas de crédito y cuentas de ahorro
      activas del cliente de la sesión, con `available_credit`
- [x] `customer-context` trae customer, profile, interacciones,
      transcripciones enmascaradas y casos desde `bank_ro`
- [x] Si la consulta del perfil falla, `profile` es `null` y el resto
      responde
- [x] Las rutas del cliente nunca traen `profile`
- [x] Un cliente sin datos da listas vacías, no un error
- [x] Ningún test llama a `/api/2.0/sql/statements`

## Manual Checks

- [x] `check-keys.sql`: las siete PK son únicas
- [x] Las siete synced tables quedan en estado sincronizado en
      `bank-assistant-chat-db` y `bank_ro` tiene las mismas filas que el
      origen
- [x] `setup.sh`: el SP del agente tiene `SELECT` solo en sus tres tablas, el
      del back en las siete, y ninguno tiene otro privilegio en `bank_ro`
- [x] `refresh.sh` termina, reaplica los grants e imprime la duración
- [x] `test-freshness.sh` pasa: el refresco trae la fila cambiada y la nueva,
      y deja todo limpio
- [x] Back local (`:3400`) con `BANK_*` apuntando a Lakebase: la consola
      muestra el contexto de un cliente y `/api/products` responde, sin
      requests a la warehouse en el log
- [x] Una consulta de movimientos por cliente sobre
      `bank_ro.customer_transactions` usa el índice de la PK (`EXPLAIN`)
- [x] `docs/datos-banco-lakebase.md` tiene frescura, linaje y la prueba
- [x] Seguimiento: el costo medido de un refresco (pipeline `e2caac30` en
      `system.billing.usage`): 0.361 DBU, USD 0.13

## Definition of Done

Todas las casillas marcadas, nombres y roles confirmados con w1:p3, y la spec
revisada por w1:p4 antes de `/spec-implement`. Sin deploy a prod hasta que se
pida.
