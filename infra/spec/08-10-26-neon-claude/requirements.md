# Runtime sin Databricks: Neon + Claude

La prueba de Databricks vence el 9 de octubre de 2026 y los resultados del hackathon salen el 16. La app desplegada tiene que seguir funcionando sin Lakebase ni Model Serving, y sin pagar Databricks.

## Qué cambia

- **Postgres:** Neon (capa gratis, us-west-2) reemplaza a Lakebase. Guarda `ai_chatbot`, `bank_sessions` y `bank_ro`.
- **Datos del banco:** `bank_ro` lleva solo los 114 clientes que usa la app (sesiones demo, chats y sesiones `sim-`), copiados del respaldo de gold/silver. Son unos 3.5 MB en total.
- **Dashboards:** fraude y retención leen el resultado de su SQL, tomado una vez del warehouse (`back/scripts/snapshot-analytics.ts`) y guardado en `bank_ro.analytics_snapshot`. Con `ANALYTICS_SOURCE=snapshot` el back no llama al warehouse.
- **LLM:** Claude Haiku 5.5 por la API de Anthropic (`LLM_PROVIDER=anthropic`) reemplaza a Qwen en Model Serving.
- **Infra:** el stack de CDK pasa `POSTGRES_URL`, `BANK_POSTGRES_URL` y `ANTHROPIC_API_KEY` desde Secrets Manager y deja de usar los service principals de Databricks.

## Qué no cambia

- El código sigue soportando Lakebase y Model Serving: sin `POSTGRES_URL` ni `LLM_PROVIDER=anthropic` funciona como antes.
- El respaldo completo (gold, silver y los chats) queda fuera del repo, en `~/factored/zenit-lakebase-backup`.

## Validación

- Tests del back (203) y del agente (522) pasan.
- El back local contra Neon, sin credenciales de Databricks, responde login, historial y los dos dashboards.
- Las herramientas del agente (`get_products`, `list_transactions`, `get_cases`) leen de Neon.
- Después del deploy: un chat con un cliente demo responde, y el admin ve los dashboards.
