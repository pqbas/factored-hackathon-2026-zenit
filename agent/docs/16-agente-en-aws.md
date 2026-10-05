# 16. El agente en AWS App Runner

El mismo agente de `main` corre en un contenedor en AWS App Runner (us-west-2, 1 vCPU / 2 GB), en paralelo a la App de Databricks, que no cambia. [Spec](../spec/01-10-26-aws-agent/); cómo desplegarlo, en [`scripts/aws/README.md`](../scripts/aws/README.md).

## Qué corre dónde

| Parte | Dónde |
| --- | --- |
| Agente (LangGraph, `POST /invocations`) | App Runner, servicio `bank-assistant-agent` |
| Clasificador | Jev (`CLASSIFIER=jev`); si no responde, las reglas |
| LLM (Qwen) | Databricks, con el service principal del agente |
| Datos del banco y sesiones `sim-` | Lakebase (`bank_ro`, `bank_sessions`), con el mismo principal |
| Trazas | Apagadas (`AGENT_TRACING=off`) |

## Decisiones

- App Runner y no AgentCore Runtime: no cambia el contrato del request y repite el patrón que ya usa el back. AgentCore pedía imagen ARM64, `/ping`, firma SigV4 en el back y secretos leídos por código; el análisis está en [17](17-agentcore-vs-app-runner.md).
- La entrada se protege con un token compartido en el header `x-agent-token`. Sin el token, todo menos `/health` responde 401. El token vive en Secrets Manager (`bank-assistant/agent/invoke-token`) y el back lo lee del mismo secreto.
- El chequeo se apaga si `AGENT_TOKEN` no está definido, así que en local y en la App de Databricks el agente se comporta igual que antes.
- El agente de AWS tiene su propio service principal, `bank-assistant-aws-agent`. Solo lee `customer_products`, `customer_transactions`, `customer_cases` y `sim_sessions`. No usa el del back, que lee las 7 tablas de `bank_ro` y escribe en `ai_chatbot`.
- App Runner inyecta los secretos como variables de entorno, así que el código del agente no llama a ninguna API de AWS.
- Las dependencias de la imagen están fijadas en `requirements-aws.lock`, porque `uv.lock` no se versiona.

## Latencia medida

Medición del 1 de octubre de 2026 contra el servicio de AWS, con el token y la sesión `demo-mx-1`: 20 turnos en 4 rondas de saldo, movimientos y reclamo (3 turnos).

| Escenario | Turnos | p50 | Máximo |
| --- | --- | --- | --- |
| Saldo | 4 | 4.01 s | 5.08 s |
| Movimientos | 4 | 6.80 s | 22.76 s |
| Reclamo | 12 | 1.63 s | 2.33 s |
| Total | 20 | 2.03 s | 22.76 s |

- El p95 del total fue 8.71 s.
- Jev clasificó los 20 turnos; ninguno cayó a las reglas.
- El turno de 22.76 s fue uno solo, de movimientos, y fue el turno en que se activó el guard de grounding. Según el log del servicio, a los 11.6 s el guard descartó una lista de movimientos escrita sin llamar a `list_transactions`. El reintento forzado, que llama a la herramienta y vuelve a redactar la lista, tardó otros 10.5 s. No fue la red ni AWS.
- El guard de grounding se activó una vez en movimientos y el reintento respondió bien.
- El reclamo terminó en handoff (`reason: complaint`) al confirmar con "sí".

## Latencia por salto, desde dentro del contenedor

Medición del 1 de octubre de 2026 con la ruta de diagnóstico, 30 muestras por sonda (5 en la primera conexión). "Laptop" es la misma imagen corriendo en local, con las mismas sondas.

| Salto | AWS p50 | AWS p95 | AWS máx | Laptop p50 | Laptop p95 |
| --- | --- | --- | --- | --- | --- |
| Red al workspace (TCP, 443) | 0.005 s | 0.006 s | 0.009 s | 0.158 s | 0.207 s |
| Red a Lakebase (TCP, 5432) | 0.005 s | 0.007 s | 0.007 s | 0.150 s | 0.226 s |
| Token OAuth del service principal | 0.061 s | 0.147 s | 0.150 s | 0.225 s | 0.376 s |
| Qwen mínima ("di hola", 5 tokens) | 0.168 s | 0.699 s | 0.709 s | 0.331 s | 0.447 s |
| Qwen, respuesta de saldo (200 tokens máx.) | 1.552 s | 1.769 s | 1.824 s | 1.697 s | 1.940 s |
| Lakebase, `get_products` con el pool abierto | 0.004 s | 0.004 s | 0.008 s | 0.146 s | 0.224 s |
| Lakebase, pool nuevo + token + primera consulta | 0.695 s | 0.955 s | 0.955 s | 4.448 s | 4.862 s |
| Jev, una clasificación | 0.089 s | 0.233 s | 0.243 s | 0.281 s | 0.607 s |

- La red entre App Runner y Databricks pesa unos 5 ms por salto: están en la misma región.
- El turno lo domina Qwen generando texto: 1.5 s para una respuesta de saldo, frente a 0.17 s de una llamada mínima. Acercar el agente a Databricks casi no cambia eso (1.55 s contra 1.70 s desde la laptop).
- Lakebase pasa de 0.15 s por consulta desde la laptop a 0.004 s; los 0.15 s eran casi todo red.
- La primera conexión a Lakebase (0.7 s) se paga una vez por proceso, no por turno.
- Sin errores en AWS. Desde la laptop, 30 llamadas seguidas a Qwen dieron `RateLimitError`; por eso las sondas de Qwen esperan 2 s entre muestras.

## Diagnóstico: `POST /diag/latency`

Ruta de diagnóstico, no parte del contrato del agente ([spec](../spec/01-10-26-latency-probe/)). Solo existe si `AGENT_TOKEN` está definido, así que no existe en local ni en la App de Databricks, y pide el mismo `x-agent-token`. Devuelve solo tiempos y nombres de tipos de error.

```bash
curl https://<url del servicio>/diag/latency -H "x-agent-token: $TOKEN" \
  -H 'content-type: application/json' -d '{"probe": "qwen_min", "samples": 30, "pause": 2}'
```

Sondas: `connect_workspace`, `connect_lakebase`, `oauth_token`, `qwen_min`, `qwen_reply`, `lakebase_query`, `lakebase_first` y `jev`. Una sonda por request, con 30 muestras como máximo (5 en `lakebase_first`); `pause` espera entre muestras sin contarse. `qwen_reply` con 30 muestras no entra en el tiempo máximo de un request de App Runner: se pide en tandas de 10 y se juntan los `times`.

## Pendiente

- Trazas: se decide después (Langfuse u otra).
- Rotar el token de entrada, dominio propio y auto scaling quedan fuera de alcance.
