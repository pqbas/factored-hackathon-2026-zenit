# 11. Herramientas de implementación

Qué servicio o librería implementa cada parte del diseño. El criterio es usar
primero lo que Databricks ya trae y construir solo lo que no existe en la
plataforma. Casi todas las librerías ya están en la plantilla del agente
(`pyproject.toml` y `uv.lock`).

## 11.1 Alcance

La primera versión es solo **texto**: el cliente escribe en el chat y el agente
responde por escrito. La voz se analiza después. En los tres caminos posibles
(voz en el navegador, modelos abiertos en Model Serving o una API externa) el
grafo sigue recibiendo texto, así que esta elección no cambia.

## 11.2 Componentes

| Parte                                | Servicio                                                             | Uso                                                                                                                               | Librerías                                                   |
| ------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Agente                               | Apps (Databricks)                                                    | Solo `/invocations`, sin estado: recibe el historial del back en cada request y responde.                                         | `mlflow` 3.16.1 (AgentServer), `fastapi` 0.141.1, `uvicorn` |
| Grafo principal                      | —                                                                    | Cada nodo es una función; el ruteo entre nodos es código. El LLM solo decide dentro de `agent`.                                   | `langgraph` 1.2.12                                          |
| `classify` (guardrail e intención)   | Jev (externo)                                                        | Una llamada por mensaje, con tiempo límite; si no responde, reglas y el clasificador actual como respaldo.                        | `httpx` 0.28.1, `pydantic` 2.13.5                           |
| LLM del `agent`                      | Model Serving, `databricks-qwen3-next-80b-a3b-instruct` (Databricks) | Responde; con caso de uso, solo con las herramientas de ese caso (`bind_tools`).                                                  | `databricks-langchain` 0.20.0 (`ChatDatabricks`)            |
| Herramientas de cada caso de uso     | Unity Catalog functions, un schema por caso (Databricks)             | Las únicas operaciones sobre datos del caso; cada una filtra por `customer_id` (ver [doc 12](12-customer-id-en-herramientas.md)). | SQL (`CREATE FUNCTION`), `databricks-sdk` 0.142.0           |
| Servidor MCP de cada caso de uso     | MCP administrado sobre ese schema (Databricks)                       | `/api/2.0/mcp/functions/{catalog}/{schema}`; `load_context` lo conecta con la identidad del agente (OAuth).                       | `databricks-mcp` 0.9.2, `langchain-mcp-adapters` 0.3.2      |
| Permisos de cada caso                | Grants de Unity Catalog (Databricks)                                 | Solo el service principal del agente tiene `EXECUTE` sobre las funciones.                                                         | —                                                           |
| `routing.yaml`                       | —                                                                    | Etiquetas para Jev, instrucciones y schemas de cada caso; se valida al arrancar.                                                  | `pyyaml` 6.0.3, `pydantic` 2.13.5                           |
| Datos del banco                      | Unity Catalog y SQL warehouse (Databricks)                           | Tablas que leen las funciones de cada caso.                                                                                       | —                                                           |
| Historial de la conversación         | —                                                                    | Llega del back en `request.input` (últimos 20 mensajes); el grafo se compila sin checkpointer y el agente no tiene base.          | —                                                           |
| Conversaciones, handoffs y asesores  | Base del back (Postgres local, Lakebase en producción)               | Fuera del agente: el back las guarda y expone la API de la consola (ver [límites](../../docs/limites-agente-back.md)).            | —                                                           |
| Trazas, evaluación y revisión humana | MLflow 3 (Databricks)                                                | Traza de cada turno, evaluación con las fichas de comportamiento y Review App.                                                    | `mlflow` 3.16.1 (`mlflow.genai`)                            |
| Secretos (API key de Jev)            | Secret scopes (Databricks)                                           | La App lee la key como variable de entorno; nunca va al repo.                                                                     | —                                                           |
| Despliegue                           | Asset Bundles (Databricks)                                           | App y permisos declarados en `databricks.yml`.                                                                                    | Databricks CLI                                              |
| Tests                                | —                                                                    | Tests del grafo y de las reglas.                                                                                                  | `pytest` 9.1.1                                              |

Notas:

- **MCP administrado.** Ya responde en este workspace: un `tools/list` sobre
  `/api/2.0/mcp/functions/system/ai` devolvió una respuesta válida. Un caso de
  uso nuevo es un schema con sus funciones y una entrada en `routing.yaml`; no
  hay que desplegar ni pagar una App por caso. Como no tiene un campo
  `instructions`, las instrucciones del caso van en `routing.yaml`.
- **Jev es la única pieza externa** y la única que saca el texto del workspace.
  Conviene tener lista la alternativa en Databricks: la misma interfaz de
  `classify` con un LLM de Model Serving y salida estructurada, más lento y sin
  probabilidad calibrada.
- **Dependencias.** Hay que declarar en `pyproject.toml` las que hoy llegan solo
  como dependencia de otra (`databricks-mcp`, `httpx`, `pyyaml`),
  para que una actualización no las quite.

## 11.3 Framework del agente

Se usa **LangGraph**. Databricks lo soporta oficialmente: el agente parte de su
plantilla de LangGraph (`AgentServer` de MLflow y `ChatDatabricks`), sin el
checkpointer en Lakebase, porque el agente no guarda estado entre requests (ver
[Límites entre el agente y el back](../../docs/limites-agente-back.md)).

| Criterio                         | LangGraph                                                         | Python con el SDK (sin framework)                                        | Strands Agents                                                             |
| -------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Ruteo determinista (Jev primero) | Nodos y aristas condicionales; el LLM entra solo en `agent`.      | Se escribe a mano con `if`: simple, pero es código propio.               | El centro es el bucle del LLM; el ruteo fijo hay que armarlo aparte.       |
| Historial por request            | Se compila sin checkpointer; el historial llega del back.         | Igual: el historial llega del back.                                      | Igual: el historial llega del back.                                        |
| Herramientas MCP                 | `langchain-mcp-adapters`.                                         | Hay que armar a mano el bucle de llamadas a herramientas.                | Nativo.                                                                    |
| Trazas en MLflow                 | Automáticas.                                                      | Automáticas en las llamadas al LLM; los pasos propios hay que marcarlos. | Hay que integrarlas.                                                       |
| Código existente                 | El grafo de la disputa y sus 27 tests siguen sirviendo.           | Habría que reescribirlo.                                                 | Habría que reescribirlo.                                                   |
| Voz                              | No trae; se agrega voz a texto y texto a voz alrededor del grafo. | Igual que LangGraph.                                                     | `BidiAgent` (experimental) con modelos de voz a voz externos a Databricks. |

El SDK sin framework solo convendría si el agente fuera una sola llamada al LLM
con herramientas; aquí el valor está en el ruteo fijo entre nodos. La ventaja
de Strands en voz no compensa, porque un modelo de voz a voz escucha el audio
antes que Jev y eso rompe el orden del grafo.

## 11.4 Pendientes de confirmar

- **API de Jev**: formato de la petición y la respuesta, límites, latencia real
  y condiciones de uso de datos. No se conoce un SDK oficial.
- **Escrituras desde UC functions**: las funciones SQL de Unity Catalog son de
  lectura. Crear una queja o un caso (`MERGE`) necesita una función Python con
  acceso al warehouse, o quedarse en el agente como hoy.

## 11.5 Estado

Pendiente. Ninguna de las piezas nuevas se usa todavía en el código.
