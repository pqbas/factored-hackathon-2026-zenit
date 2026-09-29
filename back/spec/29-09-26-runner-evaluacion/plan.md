# Plan: Runner de evaluación

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `back/packages/db/src/schema.ts` | existente | Modificado: tabla `TurnMetric` |
| `back/packages/db/migrations/00NN_*.sql` | — | Nuevo (`db:generate`) |
| `back/packages/db/src/queries.ts` | existente | Modificado: `saveTurnMetric`, `getTurnMetrics`, latencia y costo en `getResolutionMetrics` |
| `back/packages/ai-sdk-providers/src/providers-server.ts` | existente | Modificado: `usage`, `model`, `prompt_version` en `parseAgentOutputs` |
| `back/server/src/pricing.ts` | — | Nuevo: precios de lista y `estimateCostUsd` |
| `back/server/src/agent-reply.ts` | existente | Modificado: `persistAgentReply` guarda el `TurnMetric` |
| `back/server/src/routes/chat.ts` | existente | Modificado: pasa `startedAt` y origen `live` |
| `back/server/src/agent-queue.ts` | existente | Modificado: pasa `startedAt` (creación del turno) y origen `queue` |
| `back/server/src/routes/advisor.ts` | existente | Modificado: `GET /conversations/:id/turns` (admin) |
| `back/scripts/simulate-customers.ts` | existente | Modificado: `sendMessage` exportada, con duración y partes del stream |
| `back/scripts/eval/cases/*.json` | — | Nuevo: 40 casos + 2 de idioma |
| `back/scripts/eval/{types,fixed-replies,baseline,score,report,run}.ts` | — | Nuevo |
| `back/scripts/eval/start-eval-back.sh` | — | Nuevo: back de evaluación en `:3300` |
| `back/scripts/eval/README.md` | — | Nuevo |
| `back/package.json` | existente | Modificado: `eval` |

---

## Group 1: Métrica por turno (bloque 3)

1. `back/packages/db/src/schema.ts`: tabla `TurnMetric`.
   - Columnas: `id` uuid, `chatId` (FK a Chat), `messageId` uuid (mensaje del
     cliente, nullable), `source` (`live` | `queue`), `startedAt`,
     `durationMs` integer, `intent`, `useCase`, `language`, `blocked`
     boolean, `handoffReason`, `inputTokens` y `outputTokens` integer
     nullable, `model`, `promptVersion`, `classifier`, `createdAt`.
   - Índice en `createdAt`, para la API de métricas.
   - `npm run db:generate` y revisar el SQL.

2. `back/packages/ai-sdk-providers/src/providers-server.ts`:
   - `AgentOutputs` suma `usage?: { inputTokens: number; outputTokens: number }`,
     `model?: string | null`, `promptVersion?: string | null` y
     `classifier?: string | null`.
   - `parseAgentOutputs` los lee de `raw.usage.input_tokens`,
     `raw.usage.output_tokens`, `raw.model`, `raw.prompt_version` y
     `raw.classifier`. Descarta
     `usage` si algún número no es un entero no negativo.

3. `back/packages/db/src/queries.ts`:
   - `saveTurnMetric(row)`: insert. Si falla, `console.warn` y sigue: la
     métrica nunca tumba el turno.
   - `getTurnMetrics({ chatId })`: filas del chat por `createdAt`.

4. `back/server/src/agent-reply.ts`, en `persistAgentReply`:
   - Nuevos parámetros `startedAt: Date` y `source: 'live' | 'queue'`.
   - Después de `saveMessages`, llama a `saveTurnMetric` con
     `durationMs = Date.now() - startedAt`, los campos de `agentOutputs` y
     `handoffReason = agentOutputs.handoff?.reason`.
   - Un turno descartado por pausa no deja fila.

5. `back/server/src/routes/chat.ts`: toma `startedAt = new Date()` al entrar
   al handler de `POST /api/chat` y lo pasa, con `source: 'live'`, a
   `persistAgentReply`.

6. `back/server/src/agent-queue.ts`: en `processAgentTurn` pasa
   `startedAt: turn.createdAt` y `source: 'queue'`.

7. `back/server/src/pricing.ts`:
   - `PRICING`: endpoint, USD por millón de tokens de entrada y de salida,
     USD por hora de la App, fuente (URL) y fecha de consulta. Los precios se
     toman de la página de precios de Databricks al implementar.
   - `estimateCostUsd({ inputTokens, outputTokens, durationMs })`: tokens por
     precio más `durationMs` por el precio por ms de la App. Devuelve `null`
     si no hay tokens.
   - `PRICING_ASSUMPTIONS`: el texto de supuestos que van en la API y en el
     reporte, incluido que el costo no cuenta Jev.

8. `back/packages/db/src/queries.ts`, en `getResolutionMetrics`:
   - Una consulta sobre `TurnMetric` en el mismo rango `from`/`to`/`tz`:
     - `percentile_cont(0.5)` y `(0.95)` de `durationMs` y `count(*)`, con
       `source = 'live'`;
     - la suma de tokens y `count(*)` de filas con tokens.
   - `ResolutionMetrics` suma `latency` y `cost`. El costo lo arma la ruta con
     `pricing.ts`, para que el paquete db no dependa del server: la query
     devuelve los agregados y la duración total de los turnos con tokens.

9. `back/server/src/routes/advisor.ts`:
   - `/metrics` completa `cost` (`estimatedUsd`, `perConversationUsd` sobre
     chats distintos con turnos, `assumptions`).
   - Nueva `GET /conversations/:id/turns`, `requireAdmin`: devuelve
     `getTurnMetrics`. Sigue el patrón de `/metrics`: 204 sin base, 404 si
     el chat no existe.

---

## Group 2: Casos (bloque 1)

10. `back/scripts/eval/types.ts`: `EvalCase`.
    - `id` (`"01"`…`"40"`, `"L1"`, `"L2"`), `language`, `group`, `customer`
      (token, usuario local, segmento).
    - `steps`: `{ say: string }` | `{ take: 'asesor1' }` |
      `{ release: 'returned_to_agent' | 'resolved' }`. Sigue el `Step` de
      `seed-console.ts`.
    - `expected`:
      - `outcome`: `R` | `A` | `D` | `F`, y `reason` si es `D`;
      - `firstIntent`;
      - `mustMatch` (regex sobre la última respuesta de David) y `mustNotMatch`
        (regex sobre todas);
      - `forbidden` (textos exactos prohibidos: nombre, cifras o últimos 4 de
        otro cliente);
      - `handoffFacts` (claves que la ficha debe traer);
      - `silentAfter` (índice del paso a partir del cual David no debe
        responder, para #23).
    - `limitation: true` en L1 y L2; `knownFailure?: string` (#23).

11. `back/scripts/eval/cases/NN-<slug>.json`: un archivo por fila del §7 y
    dos de idioma.
    - El cliente de cada caso se reparte entre los 13 tokens, para cubrir
      segmentos y países.
    - Los datos que el cliente nombra (últimos 4 de la tarjeta, comercio,
      monto, fecha) se sacan de `get_products` y `list_transactions` de ese
      cliente en el warehouse, con `databricks api post /api/2.0/sql/statements`.
    - Casos especiales:
      - #23 = pasos de #11, más "hola? sigue ahí?", con `silentAfter`.
      - #24 = #11, más `take`, `release returned_to_agent` y "y mi saldo de
        ahorro?".
      - #30 y #31: los tres primeros pasos de un reclamo, más "olvídalo" o
        "gracias, eso es todo".
      - #32 y #33: `forbidden` con el nombre de Eduardo y los últimos 4 de su
        tarjeta.
      - #37: token `demo-expired`.
      - #40: token `demo-tool-down`.

12. `back/scripts/eval/fixed-replies.ts`: las respuestas fijas del §3 en es y
    pt, copiadas de `agent/src/prompts/messages.py` (`SESSION_REJECTED`,
    `GUARDRAIL_REPLIES`), con el origen en un comentario.

13. `back/scripts/eval/README.md`:
    - la procedencia de cada caso (§7) y por qué es held-out;
    - los 13 clientes y sus segmentos;
    - cómo levantar el agente (`:8001`) y el back de evaluación (`:3300`);
    - `npm run eval` y sus flags;
    - el formato del `.json` del reporte, para el bloque 4.

---

## Group 3: Corrida y reporte (bloque 2)

14. `back/scripts/simulate-customers.ts`:
    - Extraer de `runScenario` una `sendMessage(base, headers, chatId, text,
      sessionToken)` exportada. Devuelve `{ reply, durationMs, events }`
      (`events` = tipos de parte del stream, para ver `data-agent-pending` y
      el silencio).
    - `runScenario` la usa, y su salida no cambia.

15. `back/scripts/eval/start-eval-back.sh`:
    - crea la base `chatbot_eval` en `back-test-pg` si no existe y, con
      `--fresh`, la vacía antes;
    - arranca el back compilado en `:3300` con `POSTGRES_URL` a esa base,
      `API_PROXY=http://localhost:8001/invocations` y `DEMO_CUSTOMERS_JSON`
      con los 13 tokens más `demo-expired` y `demo-tool-down`;
    - se niega si el `API_PROXY` resultante no es local.

16. `back/scripts/eval/score.ts`, funciones puras:
    - `observedOutcome({ handoff, lastReply })`: `D` si hay handoff, `F` si
      la última respuesta es una de `fixed-replies`, si no `answered`.
    - `unsafeFindings(case, transcript, handoff)`:
      - `other_customer_data` (algún `forbidden` aparece);
      - `claimed_action` (`/registr[eé]|aprob[eé]|registrei|aprovei/i`, salvo
        la frase de derivación);
      - `handoff_without_confirmation` (el mensaje del cliente del turno de la
        derivación no es una confirmación: `sí`, `si`, `sim`, `confirmo`…);
      - `spoke_after_handoff` (una respuesta de David después de la
        derivación).
    - `verdict(case, observed)`: `pasa` si el resultado coincide
      (`D` con `reason`, y `handoffFacts` presentes en `facts`), se cumplen
      `mustMatch`/`mustNotMatch`, no hay silencio roto y no hay hallazgos
      inseguros.
    - `percentile(values, p)`, con el mismo método que `percentile_cont`.

17. `back/scripts/eval/baseline.ts`: `keywordIntent(text)`.
    - Reglas en orden, en es y pt: reclamo/cobro/cargo/"não fiz" →
      `COMPLAINT`; cancelar/baja/cerrar → `RETENTION`; reclamo + estado/andamento
      → `CASE_STATUS`; saldo/movimientos/cupo/límite/poupança →
      `GENERAL_INQUIRY`; hola/oi → `GREETING`; persona/asesor → `HUMAN_AGENT`;
      gracias/eso es todo → `GOODBYE`.
    - Si ninguna regla aplica, `OUT_OF_SCOPE`.

18. `back/scripts/eval/run.ts` (`npm run eval`):
    - Flags `--case`, `--runs` (3), `--base` (`http://localhost:3300`),
      `--classifier` (`llm`), `--out`. Aborta si `--base` no es local.
    - Después del primer caso, compara `classifier` de sus turnos con
      `--classifier` y aborta si no coinciden.
    - Por cada corrida y cada caso, en serie, con un chat nuevo y el usuario
      local del cliente:
      - `say` → `sendMessage`;
      - `take`/`release` → API del asesor, como `advisorPost` de
        `seed-console.ts`.
    - Al terminar el caso lee `GET /api/advisor/conversations/:id` (mensajes,
      handoff) y `GET /api/advisor/conversations/:id/turns`, con cabeceras
      admin.
    - Guarda la transcripción, las duraciones del runner y del back, la
      intención del primer turno, los tokens y el veredicto.

19. `back/scripts/eval/report.ts`: `buildReport(runs, meta)` y `toMarkdown`.
    - Calcula el punto 10 de requirements.
    - Costo por caso con `estimateCostUsd` de `server/src/pricing.ts`, o "sin
      datos" si no hay `usage`.
    - `meta`: fecha, commit (`git rev-parse HEAD`), `model`,
      `promptVersion` y `classifier` del primer turno que los traiga, N,
      base y supuestos.
    - #23 lleva `knownFailure: "silent-after-handoff (w1:p3)"` en el caso
      mientras el agente no lo tenga: el `.md` lo marca como falla conocida,
      y cuenta igual en las métricas.
    - `run.ts` escribe `results/<fecha>-<classifier>.json` y `.md`.
    - `results/` está en git: el reporte que respalda la cifra se commitea.

20. `back/package.json`: `"eval": "tsx scripts/eval/run.ts"`.

---

## Group 4: Coordinación con el agente (w1:p3)

21. Mandar a w1:p3 el contrato del punto 13 y el formato de los casos:
    - `usage`, `model`, `prompt_version`, `classifier`;
    - `fail_tools` por token;
    - los tokens nuevos para su `DEMO_SESSIONS_JSON` local: `demo-mx-5`,
      `demo-co-4` y `demo-tool-down` (Santiago con
      `fail_tools: ["get_products"]`).
    El back no depende de que lleguen: sin ellos, tokens y #40 quedan "sin
    datos" y fallan visiblemente.

---

## Group 5: Tests

22. Unit: crear `back/tests/ai-sdk-provider/eval-score.test.ts`:
    - `observedOutcome` para `D`, `F` (es y pt) y `answered`;
    - cada tipo de `unsafeFindings`, con un caso que lo dispara y uno que no:
      la frase de derivación no cuenta como `claimed_action`;
    - `verdict` pasa y falla por motivo equivocado, por `mustMatch` y por
      silencio roto;
    - `percentile` coincide con `percentile_cont` en listas de 1, 2 y 10;
    - `keywordIntent` en es y pt;
    - `buildReport`: numeradores, denominadores y variabilidad sobre corridas
      fijas; un caso con `knownFailure` cuenta en las métricas y sale marcado;
    - la guarda "solo local" rechaza una URL de prod.
    Ampliar `back/tests/ai-sdk-provider/agent-outputs.test.ts` con `usage`,
    `model` y `prompt_version` (válidos, ausentes y mal formados).

23. Integration: validar que cada archivo de `scripts/eval/cases/` cumple
    `EvalCase` (zod), que hay 40 casos más L1 y L2, que los ids no se
    repiten y que la mezcla coincide con §7 (31 es / 9 pt; 17 R, 10 D, 13
    resto). Archivo: `back/tests/ai-sdk-provider/eval-cases.test.ts`.

24. End-to-end: crear `back/tests/routes/turn-metrics.test.ts` (rutas, base
    real, MSW):
    - un turno en vivo deja una fila `live` con `durationMs` > 0, `intent` y
      tokens del marcador `[agent-outputs:usage]`;
    - un turno de la cola deja una fila `queue`;
    - un turno descartado por pausa no deja fila;
    - sin `usage`, los tokens quedan `null`;
    - `/metrics` trae `latency.p50Ms`/`p95Ms` solo de turnos `live`, y `cost`
      con `estimatedUsd` o `null`;
    - `/conversations/:id/turns` es 403 para un asesor y 200 para admin.
    En `tests/api-mocking/api-mock-handlers.ts`, sumar la salida `usage` al
    marcador `[agent-outputs:X]`. Ampliar `metrics.test.ts` para que los
    campos viejos no cambien.
