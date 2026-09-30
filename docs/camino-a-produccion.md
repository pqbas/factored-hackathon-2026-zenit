# Camino a producción

Estado: **borrador**. Hoy cubre el costo y la frescura de los datos que lee
David. Faltan capacidad, monitoreo, controles de acceso y retención (bloque 6
de `spec/29-09-26-evidencia-hackathon/`).

## 1. Dónde lee David los datos del banco

### Qué medimos (29/09/2026, billing de la cuenta)

| Camino de lectura | Cómo cobra | Medido |
| --- | --- | --- |
| UC functions por el MCP administrado de Databricks | Cómputo serverless por Databricks Connect, a 0.75 USD/DBU; la sesión cobra mientras sigue viva, no por consulta | USD 110 en total; USD 10–15 por hora de pruebas continuas; USD 2.21 en total en prod (poco tráfico) |
| SQL warehouse 2X-Small (4 DBU/h × 0.70 USD) | Tiempo encendida; se apaga sola tras 1 min sin consultas | USD 2.80 por hora encendida; ~USD 0.05 por una consulta aislada |
| Lakebase (Postgres, CU_1) | Costo fijo, haya o no consultas | ~USD 0.18/h, que ya pagamos por las conversaciones |
| LLM (Qwen 3 80B) | Por token | USD 0.55 en la misma tarde en que el serverless costó USD 52 |

El costo lo dominaba el cómputo que lee las tablas, no el LLM. Mover el MCP a
AWS (por ejemplo, a Lambda) no lo baja: una Lambda que lea las tablas de Unity
Catalog igual necesita la warehouse. Lo que baja el costo es no encender cómputo
por consulta.

### Decisión para el hackathon

Las tablas que lee David y el back se copian a Lakebase (schema `bank_ro`, de
solo lectura) como synced tables en modo snapshot. El agente las consulta con
SQL fijo por herramienta. El cliente sale siempre de la sesión y el LLM nunca
escribe SQL. Costo por consulta: prácticamente cero.

### Por qué en un banco la cuenta es otra

El costo de la warehouse (o del serverless) es fijo por hora y se reparte entre
todas las consultas de esa hora:

| Volumen | Conversaciones por hora | USD 2.80/h por conversación |
| --- | --- | --- |
| Nuestras pruebas | ~20 | ~USD 0.14 |
| Banco mediano | ~5,000 | ~USD 0.0006 |

Para nosotros, con poco volumen y crédito limitado, cada consulta paga casi la
hora entera. Con volumen de banco el costo fijo se diluye. Una atención con un
asesor humano cuesta varios dólares por contacto, así que leer directo de la
warehouse, o sincronizar más seguido, deja de ser un problema de costo.

## 2. Frescura de los datos

### El atraso ya existe antes de Lakebase

```text
Core bancario (tiempo real) → pipeline data/ → gold en Unity Catalog → copia en Lakebase
                               (por lotes)                             (cada refresco)
```

Las tablas gold tampoco están en tiempo real: las llena el pipeline de `data/`
por lotes. Lakebase suma otro atraso, el tiempo entre refrescos.

### Modos de sincronización

| Modo | Cómo sincroniza | Costo |
| --- | --- | --- |
| Snapshot | Copia la tabla completa cuando se pide | Un run de pipeline por refresco; cero si no se refresca |
| Triggered | Copia solo lo que cambió (requiere Change Data Feed en el origen), a pedido o con horario | Barato por refresco |
| Continuous | Copia cada cambio en segundos | Pipeline encendido 24/7: caro |

### Política

- **Hackathon:** snapshot bajo demanda, después de cada carga del gold. Los
  datos del organizador son estáticos, así que se sincroniza una vez. Una
  prueba de frescura demuestra que un refresco trae los cambios.
- **Producción:**
  - Triggered, encadenado al fin de cada carga del gold, para no sumar atraso
    sobre el gold.
  - David dice la fecha de los datos ("tus movimientos al 29/09, 14:00"), para
    que el cliente sepa que una compra de hace minutos puede no aparecer.
  - Las consultas que no toleran atraso (un saldo para aprobar algo, una
    compra de hace minutos en un reclamo) van directo a la API del core
    bancario en tiempo real, no a una copia analítica.

## 3. Observabilidad

Hoy la App del agente en prod corre **sin tracing**: MLflow intentaba subir cada
traza a un storage de S3 al que la App no tiene salida, y fallaba en segundo
plano. Por eso quedó apagado en prod; en local sigue activo.

De prod queda registrado:

- la conversación completa, en la base del back;
- por turno, en `TurnMetric`: duración, intención, caso de uso, idioma,
  tokens, modelo, versión del prompt y disparos del guard;
- la derivación, con motivo, resumen y ficha verificada;
- los logs de cada App.

No queda el paso a paso de cada turno: qué herramienta se llamó, con qué
parámetros y qué devolvió.

Pendiente: elegir una herramienta de trazas. Se evaluarán Langfuse o
LangSmith (free tier), o una tabla de trazas propia en Lakebase. La elección
depende de si la App se migra a AWS.

## 4. Capacidad del LLM

### Qué pasó (30/09/2026)

Para la demo se simula un día de tráfico: 100 conversaciones cortas de clientes
reales del dataset contra prod (`npm run simulate:day`, marcadas como
simulación).

- **Primer intento, 3 conversaciones en paralelo:** el endpoint de Qwen
  (`databricks-qwen3-next-80b-a3b-instruct`, pago por token) respondió 429:
  se superó su límite de consultas por segundo. Muchos turnos terminaron en
  "David no está disponible". La corrida se cortó y se borraron sus 49 chats
  y sus sesiones simuladas.
- **Segundo intento, de a una conversación:** 100 de 100 conversaciones.
  Por turno, p50 2.5 s y p95 6.0 s (runner, 268 turnos); p50 1.9 s y p95
  5.3 s (back). 6 turnos terminaron en "David no está disponible" por el 429,
  aun corriendo de a una conversación. Costo estimado: USD 1.12.

### Qué significa para producción

Cada turno hace 2 o más llamadas al LLM (clasificar y responder). Con el
endpoint de pago por token compartido, 3 conversaciones a la vez ya superan el
límite. Un banco con cientos de conversaciones simultáneas necesita:

- **Capacidad reservada** (*provisioned throughput*) en Model Serving, con los
  tokens por segundo dimensionados para el pico de tráfico, o un endpoint
  propio.
- **Menos llamadas por turno:** que la misma llamada que responde también
  clasifique, o clasificar con un modelo o servicio más liviano (Jev clasifica
  en 0.28 s).
- **Cola y reintentos con backoff** ante un 429, en vez de responder "no
  disponible" al primer error. El back ya encola turnos cuando el agente no
  responde; faltan los reintentos con espera creciente.
- **Una prueba de carga** antes de operar: conversaciones concurrentes,
  tasa de 429 y p95 bajo carga.

## 5. Arquitectura objetivo e identidades

El prototipo corre todo en Databricks Apps. En producción, las
responsabilidades se separan según quién usa cada parte y con qué identidad:

```text
Canal del cliente (web/app del banco)   ──API + OAuth──►  Agente David (servicio)
  identidad: la del banco para clientes                    │
                                                           ▼
Consola interna (asesores, supervisores) ─────────►  Back (conversaciones, derivaciones)
  identidad: SSO corporativo (Microsoft Entra ID)          │
                                                           ▼
          Datos: Unity Catalog → Lakebase (bank_ro) · LLM en Model Serving
```

| Parte | Dónde vive en producción | Identidad |
| --- | --- | --- |
| Canal del cliente | Fuera de Databricks: la web o la app del banco | La del banco para clientes, que ya autentica en su banca digital. Databricks Apps solo autentica usuarios del workspace, que los clientes no tienen. |
| Consola interna | Puede seguir en Databricks Apps | SSO corporativo: Databricks se integra con Microsoft Entra ID, así que los asesores entran con su cuenta del banco, y los roles salen de sus grupos. |
| Agente | Servicio detrás de una API, en Databricks o fuera | Service principal con OAuth M2M; recibe la identidad del cliente desde el canal, nunca del mensaje. |
| Datos y LLM | Databricks | Service principals con permisos mínimos (solo lectura en `bank_ro`). |

En el prototipo, el cliente se simula con sesiones demo dentro de la misma App
("Simulador de cliente"), y el admin puede verlo todo para la demo.
