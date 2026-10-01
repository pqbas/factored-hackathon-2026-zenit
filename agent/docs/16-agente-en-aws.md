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

- App Runner y no AgentCore Runtime: no cambia el contrato del request y repite el patrón que ya usa el back. AgentCore pedía imagen ARM64, `/ping`, firma SigV4 en el back y secretos leídos por código.
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
- El turno de 22.76 s fue uno solo, de movimientos. No se investigó la causa.
- El guard de grounding se activó una vez en movimientos y el reintento respondió bien.
- El reclamo terminó en handoff (`reason: complaint`) al confirmar con "sí".

## Pendiente

- Trazas: se decide después (Langfuse u otra).
- Rotar el token de entrada, dominio propio y auto scaling quedan fuera de alcance.
