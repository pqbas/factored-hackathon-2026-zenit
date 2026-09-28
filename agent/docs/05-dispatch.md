# 5. Dispatch

`dispatch` decide a dónde va cada mensaje. Es código determinista, sin LLM:
recibe la salida de Jev (guardrail, idioma, intención y confianza) y consulta
dos tablas.

Hay un solo agente (`agent`, un LLM). `dispatch` no elige entre agentes: elige
si el agente atiende sin caso de uso o si antes `load_context` le carga el
contexto de un caso.

## 5.1 Tablas de ruteo

| Tabla       | Qué contiene                                                | De dónde sale                          |
| ----------- | ----------------------------------------------------------- | -------------------------------------- |
| `USE_CASES` | Intención → servidor MCP del caso (`load_context` lo carga) | `routing.yaml`, versionado en el repo. |
| `CONTROL`   | Intención → nodo del grafo principal                        | Fija en el código.                     |

| Intención         | Destino                                                        |
| ----------------- | -------------------------------------------------------------- |
| `GENERAL_INQUIRY` | `bank_uc_consultas` (UC-01)                                    |
| `COMPLAINT`       | `bank_uc_quejas` (UC-02)                                       |
| `CASE_STATUS`     | `bank_uc_quejas` (UC-02)                                       |
| `HUMAN_AGENT`     | `handoff` si cumple una condición; si no, `agent` ofrece ayuda |
| `COMMERCIAL`      | `handoff`                                                      |
| `RETENTION`       | `handoff`                                                      |
| `CANCEL`          | `cancel`                                                       |
| `GREETING`        | `agent` sin caso de uso                                        |
| `GOODBYE`         | `agent` sin caso de uso                                        |
| `OUT_OF_SCOPE`    | `agent` sin caso de uso                                        |

## 5.2 Orden de decisión

```python
def dispatch(state):
    c = state["classification"]              # salida de classify (Jev)

    if c["guardrail"] != "OK":               # 1. el guardrail manda
        return guardrail_action(c["guardrail"])
    if c["intent"] == "CANCEL":              # 2a. cancelar gana, incluso a mitad de un flujo
        return "cancel"
    if c["intent"] == "HUMAN_AGENT":         # 2b. pedir humano: deriva solo con condición
        return "handoff" if handoff_condition(state, c) else "agent"
    if state.get("active_use_case"):         # 3. hay un flujo a mitad de camino:
        return "agent"                       #    el contexto del caso ya está cargado
    if c["confidence"] < THRESHOLD:          # 4. no está seguro: pregunta
        return "agent"                       #    el agente pide que aclare
    if c["intent"] in USE_CASES:             # 5. caso de uso: cargar el contexto de su MCP
        state["use_case"] = USE_CASES[c["intent"]]
        return "load_context"                #    y después sigue a agent
    return CONTROL.get(c["intent"], "agent")
```

1. **El guardrail manda.** Un mensaje bloqueado o riesgoso no llega a ningún
   caso de uso.
2. **Cancelar y pedir humano van antes del flujo activo**, para que no se tomen
   como respuesta al flujo. Cancelar siempre se acepta. Pedir un asesor deriva
   solo si se cumple una condición (insiste, el agente no pudo, no hay caso de
   uso o frustración; ver [Política de derivación](06-politica-de-derivacion.md#62-pedido-del-cliente)).
   Si no, el agente le dice qué puede resolver y que, si igual prefiere un
   asesor, lo vuelva a pedir.
3. **El flujo activo va antes de la intención.** Si el agente preguntó "¿es este
   cargo?" y el cliente responde "sí", el mensaje vuelve al agente, que todavía
   tiene cargado el contexto del caso, sin reclasificarlo.
4. **Con confianza baja, pregunta.** El agente pide al cliente que aclare en
   lugar de adivinar el caso de uso.
5. **Caso de uso o control.** Si la intención tiene caso de uso, `load_context`
   carga el contexto de su servidor MCP y el mensaje sigue al agente; si no, va
   a su nodo de control. Una intención desconocida va al agente sin caso de uso.

## 5.3 Agente sin caso de uso

Sin contexto de caso, `agent` no tiene herramientas y no lee datos del cliente.
Responde con su prompt inicial, que lista las opciones de atención tomadas de
`routing.yaml`. Atiende:

| Situación                         | Qué responde                                                 |
| --------------------------------- | ------------------------------------------------------------ |
| Solo saluda ("hola")              | Saluda, presenta las opciones y espera la respuesta.         |
| Se despide                        | Se despide y cierra la conversación.                         |
| Fuera de alcance                  | Explica que no puede con eso y presenta las opciones.        |
| Confianza baja                    | Pide que aclare, con las opciones.                           |
| Pide humano sin cumplir condición | Ofrece lo que puede resolver y que, si insiste, lo derivará. |

Si el mensaje trae saludo y pedido ("hola, no reconozco un cargo"), Jev devuelve
la intención del pedido y el mensaje va directo al caso de uso.

## 5.4 Flujo activo

`active_use_case` lo escribe el propio caso de uso cuando le hace una pregunta
al cliente, y lo limpia cuando termina (caso creado, respuesta entregada o
derivado). `cancel` y `handoff` también lo limpian.

## 5.5 Agregar un caso de uso

Se despliega su servidor MCP y se agrega una entrada en `routing.yaml`: la
etiqueta, la descripción y ejemplos que usa Jev, y el destino. El código de
`dispatch` no cambia.

```yaml
- intent: COMPLAINT
  description: El cliente reclama por un cobro, la app o la atención.
  examples: ["no reconozco un cargo", "me cobraron dos veces"]
  schemas: [bank_uc_quejas, bank_uc_comun]    # MCP administrado de cada schema
  instructions: |
    Registra la queja y crea el caso. Si es un cargo no reconocido, verifica la
    transacción antes de crear el caso. Nunca prometas un reembolso.
```

## 5.6 Por analizar: varias consultas

Queda para analizar e implementar más adelante; hoy no se resuelve.

Jev devuelve una sola intención por mensaje y `active_use_case` guarda un solo
caso. No está definido qué pasa cuando el cliente quiere más de una cosa:

| Situación                          | Ejemplo                                            | Qué falta definir                                                                                 |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Dos pedidos en un mensaje          | "Quiero ver mi saldo y reclamar un cargo"          | Si Jev puede devolver varias intenciones, en qué orden se atienden y cómo se recuerda la segunda. |
| Cambia de tema a mitad de un flujo | En medio de la queja: "¿y cuál es mi saldo?"       | Si se pausa el caso activo, se atiende la consulta y se retoma, o se abandona el caso.            |
| Pide otra cosa al terminar         | Después de crear el caso: "otra cosa, ¿mi límite?" | Cómo se retira el contexto del caso anterior y se carga el nuevo sin perder el historial.         |
| Vuelve a un caso anterior          | "Sobre el reclamo de hace un rato…"                | Si se retoma desde el historial o se consulta el estado del caso (`CASE_STATUS`).                 |

Ideas para analizar:

- **Una pila de pendientes** en lugar de un solo `active_use_case`: el caso en
  curso arriba y los pedidos que esperan abajo. Al cerrar uno, el agente ofrece el
  siguiente ("¿seguimos con tu saldo?").
- **Solo una escritura a la vez.** Una consulta de solo lectura puede
  intercalarse en un flujo; un caso que crea o modifica datos no se deja a
  medias sin confirmación.
- **Un caso por handoff.** Si un pedido se deriva, los demás pendientes van en
  el `packet` para que el asesor los vea.

## 5.7 Estado

Parcial. `dispatch` es una arista condicional (`src/graph/edges.py`) entre
`classify` y `respond`: si `classify` ya respondió (bloqueo del guardrail),
termina; si no, `CANCEL` va siempre a `cancel`, una confianza por debajo de
`INTENT_THRESHOLD` va a `respond` sin mirar la intención, y si no, busca la
intención en las rutas de `routing.yaml` (`src/schemas/routing.py`) y va a su
`destination`, o a `respond` si la intención no está en la tabla. `respond`
sin caso de uso ya cubre §5.3 (saludo, despedida, fuera de alcance, confianza
baja y opción no disponible aún); `cancel` es un nodo fijo, sin LLM.

Pendiente: `active_use_case`, `load_context` y `handoff` llegan en fases
posteriores.
