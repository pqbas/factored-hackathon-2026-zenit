# Requirements: El back llama al agente de AWS con un token compartido

Parte de back de la etapa 2 de `spec/01-10-26-despliegue-aws/`, aprobada por
w1:pB (01-10-26). El agente pasa a AWS App Runner (lo hace w1:p3) y no puede
quedar abierto. El contrato se acordó con w1:p3.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. Sin `AGENT_TOKEN`, el back llama al agente con el token OAuth de
   Databricks en `Authorization`, como hoy. Databricks Apps y local no
   cambian.
2. El cuerpo del request a `/invocations` y el SSE de respuesta no cambian.

And it changes in these ways:

3. Con `API_PROXY` y `AGENT_TOKEN` definidos, el back manda el token en el
   header `x-agent-token` y no manda `Authorization`: el token de Databricks
   no le sirve al agente de AWS.
4. `AGENT_TOKEN` sin `API_PROXY` no tiene efecto: el secreto nunca viaja a
   Databricks.
5. En AWS el token sale del secreto `bank-assistant/agent/invoke-token`, que
   crea el setup del agente. El rol de instancia del back puede leerlo.
6. `scripts/aws/setup.sh agent <url>` apunta el servicio de AWS al agente de
   AWS (`API_PROXY` y `AGENT_TOKEN`), y con `--databricks` lo devuelve al
   agente de Databricks.
7. El service principal del agente de AWS (`bank-assistant-aws-agent`) lee en
   Lakebase solo `bank_ro.customer_products`, `customer_transactions`,
   `customer_cases` y `bank_sessions.sim_sessions`.

## 2. Decisions

- Header `x-agent-token` en vez de `Authorization: Bearer`, para que no se
  confunda con el token de Databricks.
- Un service principal propio para el agente, de mínimo privilegio (decisión
  de w1:pB): el del back lee datos personales y escribe en `ai_chatbot`.
- El cambio de URL en el servicio de AWS queda para cuando el agente de AWS
  esté arriba. Esta fase solo deja el back listo.

## 3. Context

- `back/packages/ai-sdk-providers/src/providers-server.ts`: el `fetch` del
  provider, que pone `Authorization`.
- `back/scripts/aws/`: `setup.sh`, `lakebase-grants.sql`.
- `back/scripts/bank-ro/grants.sql`: los permisos que se reaplican tras cada
  refresco.
