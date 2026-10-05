# Requirements: Datos del banco desde Lakebase

Decisión del usuario (vía w1:p4, 29-09-26): las lecturas de datos del banco
dejan la SQL warehouse y el MCP de UC functions, y pasan a Lakebase, para
bajar el costo.

Costos de referencia:

| Servicio | Costo |
| --- | --- |
| MCP de UC functions (serverless por Databricks Connect) | ~USD 10/h con uso continuo, USD 110 acumulados |
| Warehouse | USD 2.8/h encendida |
| Lakebase (instancia `bank-assistant-chat-db`, CU_1) | USD 0.18/h, ya se paga |

Esta fase es la parte del back:
- crea en Lakebase la copia de solo lectura de las tablas del banco (synced
  tables en modo snapshot, en el schema `bank_ro`), con sus roles y grants,
  en un script reproducible y en `databricks.yml`;
- mueve las lecturas del back a esa copia.

Las tools del agente las migra w1:p3 sobre las mismas tablas.

No cambia ningún contrato con el front: `/api/products`, `customer-context` y
los nombres de cliente devuelven lo mismo. No cambia el esquema `ai_chatbot`.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. `GET /api/products` devuelve los productos activos del cliente de la
   sesión (tarjetas de crédito y cuentas de ahorro), con los mismos campos.
2. `GET /api/advisor/conversations/:id/customer-context` devuelve lo mismo:
   - `customer`, `profile`, `interactions`, `transcripts` (enmascaradas) y
     `cases`;
   - `profile` en `null` si no se puede leer.
3. Las rutas del cliente nunca traen `profile`.
4. La consola muestra el nombre del cliente (`customerName`), con reintento
   si falla.

And it changes in these ways:

### Copia de solo lectura en Lakebase

5. Siete tablas de Unity Catalog se copian a Lakebase como synced tables en
   modo snapshot. Van a la instancia `bank-assistant-chat-db`, base
   `databricks_postgres`, schema `bank_ro`, separado de `ai_chatbot`.
   - Tienen el mismo nombre que la tabla de origen y todas sus columnas.
   - Su PK es compuesta y empieza por `customer_id`, para que el índice de
     la PK sirva a las consultas por cliente.

   | Synced table (UC y Postgres) | Origen | PK |
   | --- | --- | --- |
   | `bank_ro.customer_products` | `workspace.bank_gold.customer_products` | `customer_id, product_id` |
   | `bank_ro.customer_transactions` | `workspace.bank_gold.customer_transactions` | `customer_id, transaction_id` |
   | `bank_ro.customer_cases` | `workspace.bank_gold.customer_cases` | `customer_id, complaint_id` |
   | `bank_ro.customer_360` | `workspace.bank_gold.customer_360` | `customer_id` |
   | `bank_ro.interaction_history` | `workspace.bank_gold.interaction_history` | `customer_id, interaction_id` |
   | `bank_ro.customers` | `workspace.bank_silver.customers` | `customer_id` |
   | `bank_ro.call_transcripts` | `workspace.bank_silver.call_transcripts` | `customer_id, transcript_id` |

   Las tres primeras son las del agente (nombres y columnas acordados con
   w1:p3).
6. Las siete comparten un solo pipeline de sincronización, sin proceso
   continuo. Un refresco las actualiza a todas.
7. `scripts/bank-ro/refresh.sh` refresca bajo demanda: dispara el pipeline,
   espera a que termine y vuelve a aplicar los grants.
8. Roles de Postgres, cada uno con `USAGE` en `bank_ro` y solo `SELECT`, nada
   más:
   - el SP de la App del agente (`3dbf24a7-2841-4cb8-b968-7ce309a84dde`):
     solo las tres tablas del agente;
   - el SP de la App del back (`046fa618-1a31-4129-b699-4c2bef67dbb7`): las
     siete.
   - En local, el agente y el back leen con la identidad del desarrollador.
9. Todo lo anterior es reproducible:
   - las synced tables están en `databricks.yml`;
   - `scripts/bank-ro/grants.sql` y `scripts/bank-ro/setup.sh` crean los
     roles y aplican los grants de forma idempotente.

### Lecturas del back

10. `server/src/bank-data.ts` lee de `bank_ro` en Lakebase con SQL fijo y
    parametrizado, en vez de la warehouse y las UC functions:
    - productos: las mismas reglas que `get_products`;
    - movimientos: las mismas que `list_transactions`;
    - contexto del cliente, perfil y nombre: las mismas consultas de hoy.
11. El back se conecta a la base del banco con su propio pool, configurable
    por separado de la base de chats:
    - en prod es la misma instancia que la de chats, con el SP de la App;
    - en local los chats siguen en el Postgres de Docker, y los datos del
      banco se leen de Lakebase con la identidad del desarrollador.
12. La App del back deja de declarar la warehouse en `databricks.yml`.
    `scripts/uc-grants.sh` queda reemplazado por `scripts/bank-ro/`.

### Evidencia para el hackathon

13. `docs/datos-banco-lakebase.md` documenta:
    - la política de frescura: cada cuánto se refresca y la staleness
      máxima;
    - la prueba de que un refresco trae los cambios;
    - el linaje (tabla gold o silver → synced table → consumidor);
    - el trade-off de costo, con los números medidos.
14. `scripts/bank-ro/test-freshness.sh` prueba la frescura con una fixture
    etiquetada, como `data/pipeline/90_test_update_correctness.py`.
    - Usa una tabla de prueba en un schema aislado (`bank_ro_test`) y la
      sincroniza.
    - Cambia una fila en Delta, refresca y verifica que Postgres trae el
      cambio.
    - Borra todo al final.

## 2. Decisions

- Synced tables en modo snapshot con refresco bajo demanda, porque los datos
  del banco son un snapshot estático (el dataset del organizador). El modo
  continuo o triggered mantiene compute encendido o exige change data feed,
  y ninguna tabla lo tiene activado.
- Política de frescura: se refresca después de cada actualización de las
  tablas gold, y a mano con `refresh.sh`. La staleness máxima es la del gold
  más la duración de un refresco.
- La PK compuesta empieza por `customer_id`, porque en snapshot la tabla se
  recrea en cada refresco y no está garantizado que un índice creado a mano
  sobreviva.
  - `customer_transactions` tiene 4.4 M filas.
  - Con esa PK, toda consulta por cliente usa el índice de la PK.
  - Antes de crear las tablas se verifica la unicidad de cada PK con una
    consulta a la warehouse. Es el único uso de la warehouse en la fase.
- Un solo pipeline para las siete tablas (`existing_pipeline_id`), para que
  un refresco sea un solo run y un solo costo de arranque.
- `refresh.sh` vuelve a aplicar los grants después de cada refresco. Si el
  snapshot recrea las tablas, los grants por tabla se pierden, y reaplicarlos
  es más robusto que depender de default privileges.
- Grants por tabla, no por columna, por la misma razón.
  - El rol del agente nunca recibe las tablas con PII (`customers`,
    `call_transcripts`, `interaction_history`).
  - El back ya lee esas tablas hoy por la warehouse, así que la exposición
    no crece.
- El mismo schema `bank_ro` sirve al agente y al back, y la instancia es la
  que ya se paga. Una instancia aparte duplicaría el costo base.
- En local, el back lee el banco de la instancia de prod (solo `SELECT`),
  porque replicar 5.8 M filas en Docker no aporta. La identidad del
  desarrollador es dueña de la instancia, así que en local no queda
  restringida a `SELECT`: se dice como limitación.
- Los tests del back no tocan Lakebase.
  - Usan un schema `bank_ro` de fixture en el Postgres de tests, con las
    mismas columnas y unas pocas filas.
  - Reemplaza el mock de MSW de la warehouse.
  - Así prueban el SQL real.
- Fuera de alcance / futuro:
  - encadenar el refresco al job del pipeline de datos (se documenta el
    comando);
  - permisos por columna;
  - borrar las UC functions, que siguen siendo el contrato de w1:p3 hasta su
    migración.

## 3. Context

- `spec/29-09-26-evidencia-hackathon/`: la fase general. El costo es parte
  de la evidencia.
- UC functions de hoy: `agent/uc/bank_uc_consultas.sql` (`get_products`,
  `list_transactions`, `get_cases`).
- Patrones existentes:
  - `back/server/src/bank-data.ts`: `runStatement` y las consultas del
    banco.
  - `back/packages/db/src/connection-pool.ts`: pool de `postgres` con token
    OAuth que se renueva.
  - `back/scripts/uc-grants.sh`: grants reproducibles de hoy.
  - `back/databricks.yml`: la instancia `chat_lakebase` y los recursos de la
    App.
- `data/pipeline/90_test_update_correctness.py`: patrón de fixture para
  probar actualizaciones.
- Coordinación con w1:p3 (29-09-26): nombres, columnas, PK y roles de las
  tres tablas del agente.
