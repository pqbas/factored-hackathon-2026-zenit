# 3. Casos de uso como servidores MCP

Cada caso de uso es un servidor MCP independiente: un schema de Unity Catalog
con sus funciones, expuesto por el MCP administrado de Databricks
(`/api/2.0/mcp/functions/{catalog}/{schema}`). No es una App propia (ver
[Herramientas de implementación](11-herramientas-de-implementacion.md)). Jev
identifica el caso antes de que intervenga ningún LLM, y solo entonces el
agente carga el contexto de ese caso.

## 3.1 Componentes del servidor

| Parte         | Dónde vive                             | Qué contiene                                                                                                                 |
| ------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Herramientas  | UC functions del schema del caso       | Las únicas operaciones sobre datos que el caso puede hacer, cada una con su descripción (`COMMENT`).                         |
| Instrucciones | `routing.yaml`, en la entrada del caso | Cuándo aplica el caso, qué pasos seguir, qué preguntar y qué nunca hacer. El MCP administrado no tiene campo `instructions`. |

```
bank_uc_consultas   functions: get_products
bank_uc_quejas      functions: list_cases, create_complaint, list_transactions
```

## 3.2 Integración con el agente

1. Jev clasifica el mensaje con las etiquetas de `routing.yaml` (ver
   [Dispatch](05-dispatch.md)). No se conecta a los servidores MCP ni ve sus
   herramientas.
2. `dispatch` elige el caso de uso según la etiqueta.
3. Hay un solo agente (`agent`). Al entrar al caso, `load_context` le suma como
   contexto adicional las instrucciones del caso (`routing.yaml`) y habilita
   solo sus herramientas. Conserva su prompt inicial y el historial de la conversación,
   así que el cliente no repite lo que ya dijo.
4. Al salir del caso (resuelto, cancelado o derivado) se retira ese contexto y
   esas herramientas, y el agente vuelve a su prompt inicial.

Agregar un caso de uso es crear su schema con sus funciones y sumar su entrada
en `routing.yaml`. El grafo principal no cambia.

## 3.3 Reglas de seguridad

- **El LLM no ve el `customer_id`.** El agente lo agrega a cada llamada desde
  la sesión y la función filtra por él (ver
  [`customer_id` en las herramientas](12-customer-id-en-herramientas.md)).
- **Permisos por grants de Unity Catalog.** Solo el service principal del
  agente tiene `EXECUTE` sobre las funciones, y cada función lee solo las
  tablas de su caso.
- **La política vive en el código de las herramientas** (umbrales, fraude,
  escalamiento), no en las instrucciones.
- **Las escrituras se releen** antes de confirmarle algo al cliente.
- **Los schemas vienen de una lista controlada** (`routing.yaml`, versionado);
  el agente no se conecta a servidores que no estén en ella.

## 3.4 Costos

- El MCP administrado no es una App: no hay costo fijo por caso de uso. Se paga
  el SQL warehouse que ejecuta las funciones.
- Las herramientas que usan varios casos (por ejemplo `list_transactions`) van
  en un schema común, y `routing.yaml` indica qué schemas carga cada caso.

## 3.5 Estado

Parcial. UC-01 corre sobre el schema `bank_uc_consultas` (`get_products` y
`list_transactions`, SQL en `uc/bank_uc_consultas.sql`), expuesto por el MCP
administrado. Ese camino ya no se usa: las herramientas leen `bank_ro` en
Lakebase con SQL fijo (docs/14), y `respond` las llama envueltas con
`bind_customer`. Las UC functions quedan como la definición gobernada que ese
SQL replica.

Pendiente: los permisos (`EXECUTE` solo para el agente) y el despliegue, en la
Phase 8; el resto de casos de uso, en sus fases.
