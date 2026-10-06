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

El prototipo corre el back, el front y el agente en AWS App Runner, con los
datos y el LLM en Databricks
([diagrama](arquitectura-aws-databricks.md)). En producción, las
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

## 6. Dónde corre: demo y producción

### Hoy

La app corre en AWS App Runner (us-west-2): un servicio para back + front
(`zenit-back`) y otro para el agente (`zenit-agent`), definidos con AWS CDK en
[`infra/`](../infra/README.md). Los datos (Lakebase) y el LLM (Qwen) siguen en
Databricks. Las Apps de Databricks, el despliegue original, están detenidas
para que todo corra en una sola nube.

Por qué se pasó a AWS:

- Las Apps de Databricks no tienen salida a internet con este plan, así que no
  pueden usar Jev (clasifica en 0.28 s) ni herramientas de trazas externas.
- Cada deploy en Databricks Apps corta el servicio 1 a 2 minutos. En App
  Runner se midió un deploy completo sin corte: 398 de 398 pedidos con 200.
- Costo de las apps: ~USD 18 por día en Databricks, frente a ~USD 1 por día
  en App Runner con el tráfico de una demo.

### App Runner para demo, Fargate para producción

App Runner cobra la memoria siempre y la CPU solo mientras atiende pedidos, e
incluye HTTPS, balanceo y deploy sin corte. Con poco tráfico es lo más
barato y lo más simple.

| Dos servicios (1 vCPU / 2 GB cada uno) | App Runner | ECS Fargate |
| --- | --- | --- |
| Con tráfico de demo | ~USD 1 por día | ~USD 2.90 por día (tareas encendidas 24 h más el balanceador) |
| Con tráfico constante | Hasta USD 3.74 por día | ~USD 2.90 por día |

En producción se migraría a ECS Fargate, con la misma imagen de contenedor,
porque App Runner no ofrece:

- procesos de fondo: en reposo recorta la CPU, y la cola de turnos del back
  necesita correr sola (hoy está encendida en App Runner y funciona con el
  tráfico de la demo, pero sin pedidos puede atrasarse);
- pedidos de más de 120 s o WebSockets;
- contenedores acompañantes (seguridad, monitoreo);
- deploys graduales (canary, blue/green controlado);
- control fino de la red privada.

### Pendiente antes de producción

- **Infraestructura como código.** El despliegue ya está en AWS CDK
  (`infra/`) y reemplazó a los scripts de bash. Falta que incluya los service
  principals de Databricks y sus secretos, hoy creados a mano.
- **Login.** El de AWS es de demo (tres usuarios fijos). En producción, SSO
  corporativo para la consola y la identidad del banco para los clientes
  (§5).
- **Front con CloudFront.** Hoy lo sirve el back. En producción, S3 +
  CloudFront: ver la sección siguiente.
- **Cuenta de AWS.** Los recursos se crearon con la cuenta raíz. En
  producción, usuarios o roles IAM con permisos acotados.
- **Agente sin servidor.** Amazon Bedrock AgentCore Runtime cobra solo por
  uso y arranca en ~2 s (versión del 18/09/2026). Se evaluó y se dejó para
  después: exige imagen ARM64, firmar las llamadas con SigV4 y leer los
  secretos por código, y varios puntos de su contrato no están confirmados en
  la documentación.

### CloudFront: por qué no está hoy y por qué sí en producción

**En producción, la app tiene que estar detrás de CloudFront.** El stack de
CDK ya lo trae: el front sale de un bucket S3 privado y `/api/*` va al back en
App Runner, sin caché. Se activa con `-c cloudfront=on` en el deploy
([`infra/README.md`](../infra/README.md)).

Por qué en producción:

- El front (HTML, JS, CSS) se sirve desde la red de borde de AWS, cerca del
  cliente, y el back solo atiende la API.
- Permite dominio propio con certificado (ACM) y poner AWS WAF y Shield
  delante de la app.
- Un solo origen para el front y la API, sin CORS.
- Con tráfico de demo cuesta ~USD 0 (capa gratuita: 1 TB y 10 M de requests
  al mes).

Por qué hoy no está: **la cuenta de AWS no lo permite.** El 05/10/2026 el
deploy de CDK falló al crear la distribución con este error:

> Access denied for operation 'AWS::CloudFront::Distribution': Your account
> must be verified before you can add new CloudFront resources. To verify
> your account, please contact AWS Support.
> (Request ID `77d57753-96d7-4883-b1dc-e2e6ad737cc3`)

- Es una restricción de cuentas nuevas o con poco uso, no del código.
- Cambiar de región no sirve: CloudFront es global y el bloqueo es de la
  cuenta.
- La misma cuenta tiene un tope de 2 servicios App Runner por región, así que
  tampoco se puede correr un despliegue en paralelo para probar.
- Se destraba con un caso en AWS Support (*Account and billing*, gratis),
  pidiendo verificar la cuenta 335741630127 para CloudFront. Después basta un
  deploy con `-c cloudfront=on`.

