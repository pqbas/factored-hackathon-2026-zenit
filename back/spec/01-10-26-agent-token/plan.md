# Plan: El back llama al agente de AWS con un token compartido

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `back/packages/ai-sdk-providers/src/agent-auth.ts` | — | Nuevo: `setAgentAuth`, `usesAgentToken` |
| `back/packages/ai-sdk-providers/src/providers-server.ts` | existente | Modificado: el `fetch` usa `setAgentAuth` |
| `back/scripts/aws/setup.sh`, `common.sh`, `README.md` | existente | Modificado: política del rol, subcomando `agent` |
| `back/scripts/aws/lakebase-grants.sql` | existente | Modificado: SP del agente de AWS |
| `back/scripts/bank-ro/grants.sql` | existente | Modificado: SP del agente de AWS |
| `back/tests/ai-sdk-provider/agent-auth.test.ts` | — | Nuevo |

## Group 1: Back

1. `agent-auth.ts`: `setAgentAuth(headers, getDatabricksToken, env)`.
   - Con `API_PROXY` y `AGENT_TOKEN`: pone `x-agent-token`, borra
     `Authorization` y no pide el token de Databricks.
   - Si no: `Authorization: Bearer <token de Databricks>`.
2. `providers-server.ts`: el `fetch` del provider llama a `setAgentAuth`.

## Group 2: AWS y Lakebase

3. `setup.sh base` suma el secreto del agente a la política del rol.
4. `setup.sh agent <url> [--databricks]` actualiza `API_PROXY` y
   `AGENT_TOKEN` del servicio.
5. Permisos del SP `bank-assistant-aws-agent` en los dos scripts de grants.

## Group 3: Tests

6. Unit, `agent-auth.test.ts`: los tres casos de los requisitos 1, 3 y 4.
7. Integration y end-to-end: la suite existente cubre el camino sin token.
   El camino con token se verifica contra el agente de AWS cuando esté
   arriba.
