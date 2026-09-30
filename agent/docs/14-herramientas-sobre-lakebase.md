# 14. Herramientas sobre Lakebase

Las herramientas `get_products`, `list_transactions` y `get_cases` leen de Lakebase en vez de ejecutar las UC functions por el MCP administrado. Devuelven las mismas filas; solo cambia de dónde leen.

## 14.1 Problema

Las UC functions detrás del MCP administrado corren en serverless a través de Databricks Connect. Con uso continuo cuestan cerca de USD 10 por hora: van USD 110 acumulados y USD 52 en una sola tarde de corridas locales.

## 14.2 Alternativas medidas

- MCP con UC functions en serverless: unos USD 10/h con uso continuo.
- SQL warehouse 2X-Small: unos USD 2.8/h mientras está encendido, con auto-stop de 1 minuto.
- Lakebase CU_1: unos USD 0.18/h, y la instancia ya está pagada porque el chat del back la usa.

## 14.3 Decisión

- Cada herramienta ejecuta una consulta SQL fija y parametrizada contra el esquema `bank_ro` de la instancia `bank-assistant-chat-db`. El LLM nunca escribe SQL y los únicos valores enlazados son el `customer_id` de la sesión y el `product_last4` que pasa el LLM.
- El esquema sale de `BANK_RO_SCHEMA` y se valida como identificador simple; ningún otro texto se interpola en el SQL.
- Las consultas replican línea por línea las UC functions de `uc/bank_uc_consultas.sql`, que siguen en Unity Catalog como la definición gobernada. Un test compara las columnas de ambas, así que cambiar una sin la otra falla.
- Las herramientas devuelven el mismo formato que el MCP, un JSON con `columns` y `rows`, con las fechas como `2025-10-09T00:18:40.000+0000` y los decimales como texto. Así `tool_rows`, `verify_case`, el collector y `fail_tools` no cambian.
- `bind_customer` funciona igual: el esquema de argumentos es un JSON schema con `customer_id`, que se quita para el LLM y se agrega desde la sesión.
- La conexión es un pool `AsyncLakebasePool` de `databricks_ai_bridge`, que renueva el token OAuth. Hay un pool por proceso, se abre en la primera consulta y tiene máximo 4 conexiones.
- Un Lakebase que no responde falla rápido: 5 s de timeout al conectar, 5 s de espera de conexión en el pool y `statement_timeout` de 5 s por consulta. La herramienta lanza, y el turno sigue el comportamiento normal de una herramienta caída: sin derivación y sin cifras.
- El agente sigue sin estado y solo lee.
- `TOOLS_BACKEND=mcp` conserva el camino anterior como rollback sin desplegar código nuevo. Se elimina después del hackathon.

## 14.4 Linaje de los datos

`workspace.bank_gold.<tabla>` → synced table (snapshot, refresco a demanda, creada por el script del back) → Postgres `bank_ro.<tabla>` → herramienta del agente.

Las tablas son `customer_products`, `customer_transactions` y `customer_cases`, con las mismas columnas que `bank_gold`. Las claves primarias son compuestas y empiezan con `customer_id`, así que todas las consultas usan el índice de la clave. La política de frescura de los datos la define el spec del back (ver back/spec); el agente no sabe cuándo se refrescó el snapshot.

## 14.5 Identidad y permisos

- En la App el pool se conecta como el service principal del agente. El recurso `database` de `databricks.yml` le crea el rol de Postgres, y el rol solo tiene `USAGE` sobre `bank_ro` y `SELECT` sobre sus tres tablas.
- El pool resuelve el host por el nombre de la instancia y saca el token del cliente de Databricks, por eso no usa `PGHOST` ni las demás variables del recurso.
- En local se conecta el desarrollador con su identidad. Es dueño de la instancia, así que no queda limitado a `SELECT`.

## 14.6 Correr en local

1. Iniciar sesión con `databricks auth login` (o tener `DATABRICKS_HOST` y `DATABRICKS_TOKEN`).
2. Verificar que `bank_ro` existe en la instancia, cosa que hace el script del back.
3. Levantar el agente con el comando de la sección "Contra Lakebase" del README. Para volver a las UC functions, `TOOLS_BACKEND=mcp`.

## 14.7 Fuera de alcance

- Escribir en Lakebase.
- Guardar filas en caché entre turnos.
- Las lecturas del back.
