# Datos del banco desde Lakebase

El agente y el back leen los datos del banco (productos, movimientos, casos,
perfil, contactos y transcripciones) desde copias de solo lectura en Lakebase.
Antes los leían por la SQL warehouse y el MCP de UC functions.

Las copias son synced tables en modo snapshot, en el schema `bank_ro` de la
instancia `bank-assistant-chat-db`, la misma que ya guarda los chats. Todo se
crea y se refresca con los scripts de `back/scripts/bank-ro/`.

## Linaje

| Tabla de origen (Unity Catalog) | Synced table (UC → Postgres `bank_ro`) | PK | Filas | Lo lee |
| --- | --- | --- | --- | --- |
| `workspace.bank_gold.customer_products` | `workspace.bank_ro.customer_products` | `customer_id, product_id` | 400 000 | agente (`get_products`, `list_transactions`) y back (`/api/products`, perfil) |
| `workspace.bank_gold.customer_transactions` | `workspace.bank_ro.customer_transactions` | `customer_id, transaction_id` | 4 425 008 | agente (`list_transactions`) y back (`/api/products`) |
| `workspace.bank_gold.customer_cases` | `workspace.bank_ro.customer_cases` | `customer_id, complaint_id` | 67 095 | agente (`get_cases`) y back (contexto del cliente) |
| `workspace.bank_gold.customer_360` | `workspace.bank_ro.customer_360` | `customer_id` | 150 000 | back (nombre y perfil) |
| `workspace.bank_gold.interaction_history` | `workspace.bank_ro.interaction_history` | `customer_id, interaction_id` | 686 296 | back (contactos del cliente) |
| `workspace.bank_silver.customers` | `workspace.bank_ro.customers` | `customer_id` | 150 000 | back (contacto del perfil) |
| `workspace.bank_silver.call_transcripts` | `workspace.bank_ro.call_transcripts` | `customer_id, transcript_id` | 171 321 | back (transcripciones, enmascaradas) |

Las tablas gold y silver salen del pipeline de datos (`data/pipeline/`). Cada
synced table copia todas las columnas de su origen.

La PK empieza por `customer_id`, así el índice de la PK sirve a todas las
consultas por cliente. Por ejemplo, los 10 últimos movimientos de un cliente
sobre las 4.4 M filas usan ese índice y tardan 0.5 ms (`EXPLAIN ANALYZE`).

Las siete synced tables comparten un solo pipeline de sincronización. Un
refresco es un solo run que copia las siete.

## Acceso

- El agente y el back consultan con SQL fijo y parametrizado, por
  `customer_id`. El LLM nunca escribe SQL.
- El `customer_id` sale de la sesión, no del mensaje del cliente.
- `back/scripts/bank-ro/grants.sql` da a cada service principal `USAGE` en
  `bank_ro` y `SELECT` sobre sus tablas, y nada más:
  - agente: `customer_products`, `customer_transactions` y `customer_cases`,
    las únicas que usa y sin datos personales;
  - back: las siete.
- `setup.sh` aplica los grants, y `refresh.sh` los vuelve a aplicar después de
  cada refresco.

## Política de frescura

- Los datos del banco del hackathon son un snapshot estático, el dataset del
  organizador.
- Por eso no hay refresco programado ni proceso continuo.
- Se refresca bajo demanda, después de cada actualización de las tablas gold o
  silver: `back/scripts/bank-ro/refresh.sh`.
- Staleness máxima: el tiempo entre una actualización del gold y la corrida de
  `refresh.sh`, más la duración del refresco (209 s para las siete tablas).
- Un modo continuo o triggered mantendría compute encendido o exigiría change
  data feed en las tablas de origen, y ninguna lo tiene.

### Prueba de que un refresco trae los cambios

`back/scripts/bank-ro/test-freshness.sh` sigue el patrón de
`data/pipeline/90_test_update_correctness.py`. Usa una fixture chica y
etiquetada en schemas aislados (`workspace.bank_ro_test` en UC, `bank_ro_test`
en Postgres) y la borra al final.

| Paso | En el origen (Delta) | Esperado en Postgres | Resultado (29-09-26) |
| --- | --- | --- | --- |
| 1 | F-1 = v1, F-2 = v1; primera sincronización | 2 filas, F-1 = v1 | pasa |
| 2 | F-1 = v2 (update), F-3 nueva; refresco (47 s) | 3 filas, F-1 = v2, F-3 presente | pasa |

## Costo

| | Antes | Ahora |
| --- | --- | --- |
| Lectura de datos del agente | MCP de UC functions: ~USD 10/h con uso continuo (USD 110 acumulados) | Lakebase: sin costo adicional por consulta |
| Lectura de datos del back | SQL warehouse: USD 2.8/h encendida | Lakebase: sin costo adicional por consulta |
| Base | Lakebase CU_1: USD 0.18/h (ya se pagaba por los chats) | la misma instancia, sin cambio de tamaño |
| Refresco | — | pendiente de medir, por refresco completo (209 s, serverless) |
| Almacenamiento | — | 2.1 GB en `bank_ro` (costo pendiente de medir) |

- La instancia sigue en CU_1. El tamaño de Lakebase fija el cómputo, y el
  almacenamiento se cobra aparte, así que los 2.1 GB nuevos no obligan a
  subirla.
- `shared_buffers` es de 455 MB. Las consultas por cliente leen pocas páginas
  por el índice de la PK.
- El costo de un refresco sale de `system.billing.usage` para el pipeline
  `e2caac30-d15e-4b79-ae2a-4090cc039612`, con los precios de
  `system.billing.list_prices`. Está pendiente de medir: el billing llega con
  unas 2 h de atraso y se agrega cuando aparezca el cargo.
- El costo de crear las tablas está pendiente de medir. Fueron dos runs:
  - una primera carga de `customer_360`;
  - el refresco completo de las siete.

## Limitaciones

- En local, el agente y el back leen `bank_ro` de la instancia de prod con la
  identidad del desarrollador. Esa identidad es dueña de la instancia, así que
  no queda restringida a `SELECT`.
- Grants por tabla, no por columna. El back ya leía esas mismas tablas por la
  warehouse.
- Las synced tables se crearon con `create.sh`. También están declaradas en
  `back/databricks.yml`, y hay que hacer `bundle deployment bind` antes del
  próximo deploy para que no se creen de nuevo.
- El refresco no está encadenado al job del pipeline de datos: es un comando.
