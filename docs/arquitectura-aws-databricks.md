# Zenit: arquitectura AWS + Databricks

Diagrama: [`arquitectura-aws-databricks.drawio`](arquitectura-aws-databricks.drawio) (PNG editable: `arquitectura-aws-databricks.drawio.png`).

La app corre en AWS App Runner (us-west-2). Los datos y el LLM siguen en Databricks.

## Flujo

1. El cliente, el asesor o el admin entra por HTTPS a `bank-assistant-back`, que sirve la UI y la API.
2. El back guarda el mensaje en Lakebase (`ai_chatbot`) y manda el turno a `bank-assistant-agent` con el header `x-agent-token`.
3. El agente clasifica la intención con Jev (typesafe.ai). Si Jev no responde, usa reglas.
4. El agente lee los datos del cliente de Lakebase (`bank_ro`, `bank_sessions`) con SQL fijo por `customer_id`.
5. El agente arma la respuesta con Qwen en Databricks Model Serving y la devuelve al back.

## Servicios

| Servicio | Para qué |
| --- | --- |
| App Runner `bank-assistant-back` | UI React, API Express, login demo, cola de turnos (`AgentTurn`) |
| App Runner `bank-assistant-agent` | Agente LangGraph, `POST /invocations` |
| Secrets Manager | Service principals de Databricks, token del agente, logins demo |
| ECR | Imágenes del back y del agente |
| Lakebase (Postgres) | Chats y turnos (`ai_chatbot`), copia de los datos del banco (`bank_ro`), sesiones `sim-` |
| Model Serving (Qwen) | LLM del agente |
| Unity Catalog + pipeline | Tablas gold y silver, copiadas a Lakebase con synced tables (snapshot) |
| Jev | Clasificador de intención externo |

## Decisiones

- En runtime nada lee Unity Catalog, la SQL warehouse ni MCP: todo sale de Lakebase.
- El back y el agente usan service principals distintos; el del agente solo lee 4 tablas.
- Las Apps de Databricks quedan detenidas; la app vive solo en AWS.
- Las trazas están apagadas.
