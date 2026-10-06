# Validación del pipeline con el dataset real

Fecha: 2026-09-26. Dataset: `s3://factored-datathon-2026-s3-157725502942-us-east-2-an/data/` (5.1 GB, 13 tablas, 7,671 archivos).
Método: perfilado local de las 13 tablas completas (`digital_events` con una muestra de 60 días) contra el contrato `data/pipeline/tables.py`, luego la corrida del pipeline en Databricks con todas las tablas.

## Qué se cumplía sin cambios

- **Esquema:** las columnas de las 13 tablas coinciden exactamente con el contrato.
- **Tipos:** 0 fallas de conversión (fechas `YYYY-MM-DD HH:MM:SS`, booleanos `True`/`False`, decimales con punto).
- **Llaves primarias:** sin duplicados ni nulos.
- **Integridad referencial:** 100% en las relaciones que usa el agente: cliente↔transacción↔producto e interacción↔transcripción↔encuesta.
- **Particiones diarias:** `process_date` coincide con la carpeta `year=/month=/day=` de cada archivo; no hay datos tardíos.

## Problemas encontrados y acciones

| # | Problema | Impacto | Acción |
|---|---|---|---|
| 1 | Los CSV traen BOM UTF-8 antes del primer encabezado | La primera columna (la PK en casi todas las tablas) queda como `﻿customer_id` y silver no la encuentra | Bronze quita el BOM de los nombres de columna |
| 2 | Las tablas de hechos vienen en carpetas `year=/month=/day=` | Auto Loader agrega `year`, `month` y `day` como columnas extra | Bronze ignora esas columnas de partición (`cloudFiles.partitionColumns = ""`); la fecha ya está en `process_date` |
| 3 | `product_type` viene en español ("Tarjeta Crédito", "Préstamo Personal", "Préstamo Hipotecario"…) | `customer_360` separaba saldos de crédito y depósito con nombres en inglés, así que los saldos de crédito salían en 0 | Gold clasifica los productos de crédito con la lista en español (y en inglés, para los datos dummy) |
| 4 | País escrito de dos formas: "México" y "Mexico" (40,515 transacciones) | Agrupaciones y filtros por país partidos en dos | Silver normaliza "Mexico" → "México" (`VALUE_ALIASES`) y registra cuántos valores cambió |
| 5 | No existe MXN: los productos de México están en USD (y parte de los de Colombia y Argentina también) | `customer_360` derivaba la moneda del país ("México → MXN"), lo cual es falso | Gold toma la moneda principal de los productos del cliente (`primary_currency`) |
| 6 | IDs reales con formato `CLI-…`; las sesiones demo del agente apuntaban a IDs dummy (`CUS…`) | El agente no habría encontrado clientes | Sesiones demo apuntadas a clientes reales (ver resultados) |
| 7 | Auto Loader detiene el stream cuando aparece una columna nueva, y Databricks marca la tarea como fallida aunque se capture el error | Un cambio de esquema del proveedor rompería la carga | Reintentos a nivel de tarea en bronze (`max_retries: 2`); probado con el caso de prueba de actualización |
| 8 | El cómputo serverless de Free Edition no tiene salida a S3 ("Connection reset by peer") | No se puede leer el bucket de Factored desde Databricks en este workspace | Tarea `00_acquire` con tres modos: `s3` (credenciales en el secret scope `factored-datathon`, para workspaces con salida a internet), `archive` y `landing`. Aquí se usa `archive`: `data/scripts/upload_dataset.sh` sube un `.tar.gz` por tabla y Databricks lo extrae |
| 9 | Subir 7,671 CSV uno por uno con el CLI es lento (~12 min por tabla) y se corta ("context canceled") | Carga no reproducible | Un archivo comprimido por tabla: 5.1 GB de CSV → ~750 MB, subidos en ~3 min |

## Controles nuevos

- **Controles de calidad que bloquean en silver:** una tabla con PK nulas, más de 1% de valores imposibles de convertir en alguna columna, una columna NOT NULL ausente, o sin filas, no se sobrescribe (queda la última versión buena) y el job falla, así gold no se construye sobre datos malos. Los duplicados de llave no bloquean, porque los reenvíos y las correcciones tardías son legítimos: se resuelven quedándose con la versión más reciente y se reportan.
- **Severidad en el reporte:** `bank_silver._dq_report` registra cada verificación con `severity` (`critical` / `warning` / `info`).
- **Caso de prueba de actualización** (`90_test_update_correctness`, job `bank-assistant-data-update-test`): datos sintéticos etiquetados, en esquemas aislados (`test_update_*`), que pasan por los mismos notebooks del pipeline. Verifica cuatro cosas:
  - que bronze lea solo los archivos nuevos;
  - que una corrección tardía reemplace a la versión anterior;
  - que los duplicados se eliminen y se reporten;
  - que una columna nueva se conserve y que volver a correr sin archivos nuevos no cambie nada.

  Resultado de la corrida del 2026-09-26: PASS en las 10 verificaciones.

  | Entrega | Verificación | Resultado |
  |---|---|---|
  | 1 | 2 filas; T1 = Pending; BOM quitado | PASS |
  | 2 | Bronze lee solo los 4 archivos nuevos (6 filas); silver con 4 IDs; la corrección tardía deja T1 = Approved; se conserva la columna nueva `channel_detail`; se reportan 2 duplicados | PASS |
  | 3 | Sin archivos nuevos: bronze sigue con 6 filas y silver idéntico | PASS |

## Resultado de la carga real (2026-09-26)

Job `bank-assistant-data-pipeline` (`source=archive`, `reset=true`): acquire → bronze → silver → gold, SUCCESS, sin bloqueos de calidad.

| Tabla | Filas en bronze/silver |
|---|---|
| customers / products / branches / service_agents / marketing_campaigns | 150,000 / 400,000 / 350 / 1,200 / 200 |
| transactions | 4,425,008 |
| call_center_interactions / call_transcripts | 686,296 / 171,321 |
| satisfaction_surveys / complaints | 212,759 / 67,095 |
| campaign_sends / digital_events | 1,746,801 / 15,620,994 |
| daily_exchange_rates | 13,164 |

- Los conteos y hallazgos del `_dq_report` coinciden con el perfilado local.
- Las advertencias son solo las esperadas: `duration_seconds` vacío en transcripciones y sucursales huérfanas.
- La normalización de país se aplicó en 5 columnas: por ejemplo, 40,515 transacciones y el 50% de `service_agents.country_of_origin`.
- **Gold:**
  - `customer_360` tiene los 150,000 clientes.
  - 86,561 clientes tienen saldo de crédito; antes de la corrección salía en 0.
  - La moneda principal es USD en México, COP en Colombia y ARS en Argentina.
  - 10,422 clientes no tienen productos.
- **Agente con datos reales:** se probó con las sesiones `demo-mx-1` y `demo-co-1`.
  - "no reconozco un cobro de Cine Premium" → encuentra el cargo (496.44 USD), pide confirmación y registra el caso en `bank_ops.dispute_cases`.
  - El mismo flujo funciona en portugués.
  - Latencia: 7–14 s por turno con el warehouse encendido.

## Limitaciones del dataset (se reportan, no se corrigen)

| Hallazgo | Magnitud |
|---|---|
| `complaints.origin_interaction_id` vacío | 100% (67,095 / 67,095): no se puede enlazar un reclamo con su llamada |
| `customers.registration_branch_id` no existe en `branches` | ~100% |
| `service_agents.assigned_branch_id` no existe en `branches` | 831 / 833 valores distintos |
| `call_transcripts.duration_seconds` vacío aunque el diccionario lo marca NOT NULL | 24,029 filas (14%) |
| Las transcripciones son plantillas con marcadores sin completar (`{monto} {moneda}`) | Todas: no sirven para entrenar un clasificador de texto |
| `contact_reason` es idéntico a `reason_category` | Solo 6 valores; no hay un motivo detallado |
| Filas distintas a las del diccionario | transacciones 4.43M (vs 5M), encuestas 213k (vs 250k), envíos de campaña 1.75M (vs 2M), eventos digitales 15.6M (vs 10M) |
| `campaign_sends` sin 14 días de archivos | 1,083 / 1,097 días |
| El diccionario promete ~2% de duplicados y datos tardíos | No hay ninguno |
| `fraud_score` ≥ 70 solo aparece en fraudes | No se puede usar como variable del modelo (fuga de información); solo como baseline |
