# Plan: Datos del banco desde Lakebase

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `back/databricks.yml` | existente | Modificado: 7 `synced_database_tables`, sin `sql-warehouse` en la App |
| `back/scripts/bank-ro/check-keys.sql` | — | Nuevo: unicidad de las PK (warehouse, una vez) |
| `back/scripts/bank-ro/grants.sql` | — | Nuevo: roles, `USAGE` y `SELECT` (idempotente) |
| `back/scripts/bank-ro/setup.sh` | — | Nuevo: aplica `grants.sql` con el token del dueño |
| `back/scripts/bank-ro/refresh.sh` | — | Nuevo: dispara el pipeline, espera y reaplica grants |
| `back/scripts/bank-ro/test-freshness.sh` | — | Nuevo: prueba de frescura con fixture |
| `back/scripts/uc-grants.sh` | existente | Borrado (lo reemplaza `bank-ro/`) |
| `back/server/src/bank-db.ts` | — | Nuevo: pool de `postgres` a la base del banco |
| `back/server/src/bank-data.ts` | existente | Modificado: SQL sobre `bank_ro` en vez de la warehouse |
| `back/tests/fixtures/bank_ro.sql` | — | Nuevo: schema `bank_ro` de fixture para tests |
| `back/tests/api-mocking/api-mock-handlers.ts` | existente | Modificado: sin el mock de `/api/2.0/sql/statements` |
| `back/playwright.config.ts` | existente | Modificado: `BANK_POSTGRES_URL` al Postgres de tests |
| `docs/datos-banco-lakebase.md` | — | Nuevo: frescura, linaje y costo |

---

## Group 1: Synced tables, roles y grants

1. `back/scripts/bank-ro/check-keys.sql`: por cada una de las 7 tablas,
   `count(*)` contra `count(distinct <pk>)`.
   - Se corre una vez en la warehouse antes de crear las tablas.
   - Si alguna PK no es única, se detiene y se revisa con w1:p4 antes de
     seguir.

2. `back/databricks.yml`: 7 recursos `synced_database_tables`, con
   `name: workspace.bank_ro.<tabla>`,
   `database_instance_name: ${resources.database_instances.chat_lakebase.name}`
   y `logical_database_name: databricks_postgres`. Cada `spec` lleva:
   - `source_table_full_name`;
   - `primary_key_columns` (tabla del punto 5 de requirements);
   - `scheduling_policy: SNAPSHOT`;
   - `create_database_objects_if_missing: true`.

   La primera (`customer_products`) crea el pipeline con
   `new_pipeline_spec` (storage `workspace.bank_ro`). Las otras seis se suman
   a ese pipeline con `existing_pipeline_id`.
   - Si el bundle no puede referenciar el id del pipeline de otro recurso,
     `setup.sh` crea las seis con la CLI
     (`databricks database create-synced-database-table`) y el
     `databricks.yml` documenta solo la primera.
   - Se decide al implementar y se dice en el README.

3. `back/scripts/bank-ro/grants.sql`, idempotente:
   - `CREATE EXTENSION IF NOT EXISTS databricks_auth`;
   - `databricks_create_role(<sp>, 'SERVICE_PRINCIPAL')` para el SP del
     agente y el del back, solo si el rol no existe;
   - `GRANT USAGE ON SCHEMA bank_ro` a los dos;
   - `GRANT SELECT` de `customer_products`, `customer_transactions` y
     `customer_cases` al agente;
   - `GRANT SELECT` de las siete al back;
   - nada más: sin `CREATE`, sin escritura, sin otros schemas.

4. `back/scripts/bank-ro/setup.sh [profile]`:
   - host desde `databricks database get-database-instance`;
   - token desde `databricks database generate-database-credential`;
   - aplica `grants.sql` con `psql` (desde el contenedor `back-test-pg`, que
     lo trae);
   - imprime los grants resultantes (`information_schema.role_table_grants`).

5. `back/scripts/bank-ro/refresh.sh [profile]`:
   - busca el pipeline de las synced tables
     (`databricks database get-synced-database-table`);
   - `databricks pipelines start-update`, espera a que termine y falla si
     falla;
   - corre `setup.sh` para reaplicar los grants;
   - imprime la duración del refresco, que va al documento de costo.

---

## Group 2: Lecturas del back

6. `back/server/src/bank-db.ts`: `bankQuery(text, params)`.
   - Pool de `postgres` con el mismo patrón de `connection-pool.ts`: token
     OAuth como password y el pool se recrea si el token cambia.
   - Configuración:
     - `BANK_POSTGRES_URL` si está (tests);
     - si no, `BANK_PGHOST` (o `PGHOST`), `BANK_PGDATABASE` (o
       `databricks_postgres`) y `BANK_PGUSER` (o `PGUSER`, o el email de la
       CLI en local).
   - Devuelve filas con los valores como texto (fechas en ISO), para que el
     mapeo actual de `bank-data.ts` no cambie.

7. `back/server/src/bank-data.ts`:
   - `runStatement` pasa a `bankQuery`: los parámetros `:customer_id` pasan a
     `$1` y `${catalog()}.bank_gold.*` / `bank_silver.*` pasan a `bank_ro.*`.
   - `getProducts`: el SQL de `get_products` (tipos `Tarjeta Crédito` y
     `Cuenta Ahorro`, estado `Active`, `available_credit` calculado).
   - `getTransactions`: el de `list_transactions` (join por `product_id` y
     `customer_id`, 10 más recientes).
   - `getCustomerProfile`, `getCustomerRecord` y `getCustomerContext`: las
     mismas consultas, con sintaxis de Postgres.
   - El comentario del encabezado dice de dónde lee.

8. `back/databricks.yml`: quitar el recurso `sql-warehouse` de la App. La App
   ya tiene la base (`database`), y su SP recibe los grants del paso 3.

9. Borrar `back/scripts/uc-grants.sh`. Actualizar `.env.example` con las
   variables `BANK_*` y una nota para local.

---

## Group 3: Evidencia

10. `back/scripts/bank-ro/test-freshness.sh`:
    - crea `workspace.bank_ro_test.fixture` (Delta, 2 filas, etiquetada como
      fixture) y su synced table snapshot en Lakebase;
    - espera la primera carga y verifica las 2 filas en Postgres;
    - actualiza una fila y agrega otra en Delta, y refresca;
    - verifica que Postgres trae la fila cambiada y la nueva;
    - borra la synced table, el schema de Postgres y el schema de UC, salvo
      `--keep`;
    - imprime cada paso con pasa o falla.

11. `docs/datos-banco-lakebase.md`:
    - linaje: tabla de origen → synced table → consumidor (tool del agente o
      ruta del back);
    - política de frescura y staleness máxima;
    - resultado de `test-freshness.sh`;
    - costo: MCP, warehouse y Lakebase por hora, costo y duración medidos de
      un refresco (de `system.billing.usage` y `refresh.sh`) y el almacenamiento
      de `bank_ro`;
    - limitaciones.
    Se enlaza desde el README.

---

## Group 4: Tests

12. Unit: ampliar `back/tests/ai-sdk-provider/` con `bank-db.test.ts`:
    - resolución de configuración: `BANK_POSTGRES_URL` gana, después
      `BANK_PGHOST` y después `PGHOST`;
    - conversión de valores a texto (numeric, timestamp, null).

13. Integration: `back/tests/fixtures/bank_ro.sql` crea `bank_ro` con las
    siete tablas (mismas columnas y tipos que produce el sync) y filas de
    fixture:
    - un cliente con tarjetas, ahorro y movimientos;
    - uno con casos;
    - uno sin nada.
    `playwright.config.ts` lo aplica en el Postgres de tests y apunta
    `BANK_POSTGRES_URL` ahí, en los dos modos.

14. End-to-end: adaptar a la fixture, sin el mock de la warehouse,
    `back/tests/routes/products.test.ts`,
    `back/tests/routes/customer-context.test.ts` y
    `back/tests/routes/customers.test.ts`.
    - productos del cliente de la sesión, solo los activos de los dos tipos;
    - contexto completo y enmascarado;
    - profile `null` si su consulta falla (la fixture de ese cliente rompe la
      consulta del perfil);
    - las rutas del cliente sin `profile`;
    - un cliente sin datos da listas vacías.
