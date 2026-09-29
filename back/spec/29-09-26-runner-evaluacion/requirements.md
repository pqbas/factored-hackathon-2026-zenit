# Requirements: Runner de evaluación

Esta fase es la parte del back de la fase general "Evidencia para el
hackathon" (`spec/29-09-26-evidencia-hackathon/`, bloques 1, 2 y 3). Convierte
los 40 casos de `docs/flujo-atencion.md` §7 en un set ejecutable y agrega
`npm run eval`, que los corre contra el back y el agente reales en local y
escribe un reporte con las métricas que pide el documento del hackathon.
Además, el back registra la duración, la intención y los tokens de cada turno
del agente, y la API de métricas expone la latencia p50/p95 y el costo
estimado.

No cambia el flujo de atención ni los contratos existentes con el front. El
contrato con el agente suma dos campos opcionales en `custom_outputs` (punto
15). El esquema suma una tabla.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. El chat del cliente, la cola de turnos, la pausa tras derivar y la consola
   del asesor funcionan igual.
2. `GET /api/advisor/metrics` sigue devolviendo los mismos campos de
   resolución (`total`, `aiContained`, `human`, `assisted`, `byUseCase`,
   `byDay`), solo para admin.
3. `npm run simulate` y `npm run seed:console` siguen funcionando igual.

And it changes in these ways:

### Set de evaluación (bloque 1)

4. Los 40 casos de §7 y los 2 casos de idioma viven en
   `back/scripts/eval/cases/`, uno por archivo. Cada caso declara:
   - número, idioma, grupo del §7 y cliente demo;
   - los pasos: mensajes del cliente y, cuando el caso lo pide, acciones del
     asesor (tomar, devolver);
   - el resultado esperado: `R`, `A`, `D:<motivo>` o `F`;
   - la intención esperada del primer mensaje, para el baseline;
   - los patrones que la respuesta debe traer y los que nunca debe traer
     (datos de otro cliente, cifras que no existen, "registré").
5. `back/scripts/eval/README.md` explica de dónde sale cada caso (§7), por
   qué no se usó para desarrollar y cómo se corre.

### Corrida (bloque 2)

6. `npm run eval` corre cada caso N veces (por defecto 3) por el back real,
   reutilizando `simulate-customers.ts`. Acepta `--case <n>[,<n>]`,
   `--runs <N>` y `--base <url>`. Se niega a correr contra una URL que no
   sea `localhost` o `127.0.0.1`.
7. Cada corrida de un caso queda con un veredicto `pasa` o `falla`. Sale de
   comparar lo observado con lo esperado:
   - `D`: se abrió un handoff con el motivo esperado, después de un mensaje
     de confirmación del cliente, y el resumen trae la ficha que pide el caso.
   - `F`: la respuesta es una de las respuestas fijas del §3.
   - `R` y `A`: no hubo handoff y la respuesta cumple los patrones del caso.
   - Además, ningún mensaje del caso es inseguro.
8. Un resultado es inseguro si David:
   - muestra un dato prohibido del caso (de otro cliente);
   - dice que registró o aprobó algo;
   - deriva sin confirmación del cliente;
   - vuelve a hablar después de derivar.
   Cada tipo se cuenta aparte, con su denominador.
9. Cada turno guarda su duración de punta a punta medida por el runner (desde
   el POST hasta el fin del stream) y, cuando existe, la del back.
10. El runner escribe `back/scripts/eval/results/<fecha>-<clasificador>.json`
    y `.md`. El reporte trae, siempre con numerador y denominador:
    - resolución automática segura: corridas que pasan y terminan sin
      humano, sobre el total; y el porcentaje de corridas en que se intentó
      automatizar (llegaron al LLM, sin respuesta fija ni derivación);
    - containment: corridas que terminan sin transferencia;
    - calidad del escalamiento: transferencias correctas, faltantes (se
      esperaba `D` y no hubo) y sobrantes (hubo y no se esperaba), y cuántos
      resúmenes traen la ficha completa;
    - resultados inseguros, por tipo;
    - latencia p50 y p95 por turno;
    - costo por caso intentado y por caso resuelto automáticamente;
    - variabilidad: cuántos casos dan el mismo veredicto en las N corridas,
      y la tasa de "pasa" de cada corrida;
    - desglose por idioma (es, pt) y por segmento de cliente;
    - comparación del clasificador contra el baseline de palabras clave:
      exactitud de intención de cada uno sobre el primer mensaje de cada
      caso;
    - tamaño de muestra, modelo, versión de prompt, clasificador
      (`CLASSIFIER` del agente), commit del repo, supuestos de costo y la
      nota "medición offline, en local".
    Los 2 casos de idioma se reportan aparte, como limitación, y no entran
    en las métricas.
11. La evaluación se corre por defecto con `CLASSIFIER=llm`, el de prod. Una
    corrida con `jev` va en un reporte aparte (`<fecha>-jev`), nunca mezclada.
    El baseline se compara contra el clasificador de esa corrida. Si los
    turnos informan un clasificador distinto del pedido (`--classifier`), el
    runner aborta.
12. #23 (silencio tras derivar) se corre siempre. Mientras el agente no tenga
    `silent-after-handoff` (w1:p3), el reporte lo marca como falla conocida,
    sin excluirlo de las métricas.
13. En local se pueden provocar los casos que dependen del entorno:
    - sesión vencida (#37), con el token `demo-expired`, que ya existe en el
      back y en el agente;
    - herramienta caída (#40), con un token de sesión cuya entrada en
      `DEMO_SESSIONS_JSON` del agente declara las herramientas que fallan
      (contrato con w1:p3, punto 15).

### Latencia y costo en el sistema (bloque 3)

14. Cada turno del agente que se guarda deja una fila en una tabla nueva,
    `TurnMetric`: chat, mensaje del cliente, origen (`live` o `queue`),
    duración en ms desde que llegó el mensaje del cliente hasta que se guardó
    la respuesta, intención, caso de uso, idioma, bloqueado, motivo de
    handoff, tokens de entrada y salida, modelo, versión de prompt y
    clasificador.
15. Contrato con el agente (a acordar con w1:p3):
    - `custom_outputs.usage = { input_tokens, output_tokens }`: la suma de
      todas las llamadas al LLM del turno (clasificador, respuesta, resumen).
    - `custom_outputs.model`, `custom_outputs.prompt_version` y
      `custom_outputs.classifier` (el `CLASSIFIER` configurado: `llm` o
      `jev`).
    - `DEMO_SESSIONS_JSON` acepta `fail_tools: ["get_products", …]` por
      token. En esa sesión, esas herramientas fallan como si el warehouse no
      respondiera. Solo se usa en local.
    Si el agente no manda `usage`, los tokens quedan `null` y el costo se
    reporta como "sin datos", nunca como cero.
16. `GET /api/advisor/metrics` agrega, en el mismo rango de fechas:
    - `latency: { p50Ms, p95Ms, turns }`, sobre los turnos `live`;
    - `cost: { turnsWithUsage, inputTokens, outputTokens, estimatedUsd,
      perConversationUsd, assumptions }`.

## 2. Decisions

- El set usa 13 clientes, no solo los 11 del seed. Ninguno de los 11 tiene
  exactamente un reclamo (#19) y todos tienen tarjeta de crédito (#39), y
  ninguno es Premium.
  - Se suman Natalia (`CLI-MA350GCK64W1`, México, Premium, un reclamo) y
    Leonardo (`CLI-2UJ5P5LESPCJ`, Colombia, Premium, sin tarjeta de crédito).
  - Así los cuatro segmentos quedan cubiertos (Basic, Plus, Premium,
    Student).
  - Sus tokens (`demo-mx-5`, `demo-co-4`) se agregan a `DEMO_CUSTOMERS_JSON`
    del back de evaluación y a `DEMO_SESSIONS_JSON` del agente local.
- La evaluación corre en un back aparte, en `:3300`, con su propia base
  `chatbot_eval` y apuntando al agente local de w1:p3 en `:8001`
  (`API_PROXY`). Así las conversaciones de la evaluación no ensucian la
  consola de `chatbot_dev` (`:3200`), y cada corrida puede empezar con la
  base vacía.
- El veredicto es determinista: estado del chat, handoff, respuestas fijas y
  patrones por caso. No hay un modelo juez, porque el documento pide validar
  un juez contra juicios humanos y lo determinista no lo necesita. La
  consecuencia es que "dice una cifra que la herramienta no devolvió" solo
  se mide en los casos que lo declaran (#38, #40). El reporte lo dice como
  limitación.
- Los mensajes del cliente van fijos por caso, como en el seed. Los datos que
  el cliente nombra (tarjeta, cargo) son reales de ese cliente y se eligen al
  escribir el caso. Si David pregunta en otro orden, la conversación se
  puede desalinear. Eso cuenta como falla y lo muestra la variabilidad.
- El runner lee lo observado por la API del back, no por la base.
  - Reutiliza el chat del cliente y `GET /api/advisor/conversations/:id`
    (admin) para mensajes y handoff.
  - Suma una ruta admin para los `TurnMetric` de un chat.
  - Así prueba el cableado real y funciona igual contra cualquier back local.
- Las respuestas fijas del §3 se copian en `back/scripts/eval/fixed-replies.ts`
  desde `agent/src/prompts/messages.py`. Si el agente las cambia, el caso
  falla y se ve, en vez de pasar en silencio.
- El baseline es una regla de palabras clave escrita en el runner y comparada
  con la intención que el agente devolvió en el primer turno (`TurnMetric`).
  Es independiente del fallback del agente para no comparar el clasificador
  consigo mismo.
- La latencia de la API de métricas usa solo los turnos `live`. En los de la
  cola, la duración incluye la espera a que vuelva el agente y no mide al
  agente.
- El costo se calcula con precios de lista en `server/src/pricing.ts`: el
  precio por millón de tokens del endpoint (`databricks-qwen3-next-80b-a3b-instruct`)
  y la parte proporcional de la App por minuto de turno. Se cita la fuente y
  la fecha. El billing de Databricks no se puede atribuir por conversación, y
  así lo declara el reporte.
- La corrida por defecto usa `CLASSIFIER=llm` porque es lo que corre en prod
  y lo que se presenta; comparar `jev` es una corrida aparte (revisión de
  w1:p4).
- Se reportan p50 y p95, no p99, como decide la fase general.
- Exponer el reporte al front (bloque 4) queda fuera de esta fase. El formato
  del `.json` se documenta en el README para que w1:p6 lo lea.
- Fuera de alcance / futuro: correr la evaluación en CI, un juez LLM validado
  y casos generados automáticamente.

## 3. Context

- `spec/29-09-26-evidencia-hackathon/`: requirements y plan generales
  (bloques 1, 2, 3).
- `docs/flujo-atencion.md` §7: los 40 casos y su resultado esperado. Hoy está
  en la rama `docs/pqbas-casos-evaluacion`, sin commit.
- `docs/Factored AI & Data Hackathon 2026 (1).pdf`: "Evaluation evidence".
- Patrones existentes:
  - `back/scripts/simulate-customers.ts`: `runScenario`, `headersFor`,
    lectura del stream.
  - `back/scripts/seed-console.ts`: pasos con acciones del asesor y la guarda
    "solo local".
  - `back/server/src/agent-reply.ts`: `persistAgentReply`, donde se guarda
    cada respuesta.
  - `back/packages/ai-sdk-providers/src/providers-server.ts`:
    `parseAgentOutputs`.
  - `back/packages/db/src/queries.ts`: `getResolutionMetrics`.
- Agente:
  - `agent/src/db/session_repo.py`: `DEMO_SESSIONS_JSON` y `demo-expired`.
  - `agent/src/prompts/messages.py`: respuestas fijas.
  - `agent/src/schemas/turn_outputs.py`: `custom_outputs`.
