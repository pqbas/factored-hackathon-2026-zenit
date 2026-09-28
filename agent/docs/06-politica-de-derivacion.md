# 6. Política de derivación

Cuándo el agente deja de atender y deriva la conversación a un asesor humano.
Es una política de negocio: la revisa el banco y cambia sin tocar el mecanismo.

## 6.1 Motivos

| Origen                     | Motivo (`reason`)          | Ejemplo                                                                  |
| -------------------------- | -------------------------- | ------------------------------------------------------------------------ |
| `classify` (guardrail)     | `guardrail_risk`           | Señales de estafa en curso.                                              |
| `dispatch`                 | `customer_request`         | "Quiero hablar con un asesor", solo si cumple una condición (ver abajo). |
| `dispatch`                 | `commercial`, `retention`  | Contactos de Comercial y Retención van directo a humano.                 |
| Caso de uso (servidor MCP) | `policy_escalation`        | Cargo de más de 500 USD o con señal de fraude.                           |
| Caso de uso (servidor MCP) | `no_match`, `tool_failure` | No encontró el cargo dos veces, o fallaron los datos.                    |

Cualquier otro caso lo resuelve el agente o termina en el agente sin
caso de uso (fuera de alcance). Cómo se ejecuta la derivación está en [Handoff](07-handoff.md).

## 6.2 Pedido del cliente

Pedir un asesor no basta para derivar. El agente primero ofrece resolverlo él, y
solo deriva si se cumple una de estas condiciones:

| Condición              | Cuándo se cumple                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| **Insiste**            | El agente ya le ofreció ayuda en esta conversación y el cliente vuelve a pedir un asesor. |
| **El agente no pudo**  | En esta conversación, un caso de uso falló o `classify` tuvo confianza baja dos veces.    |
| **No hay caso de uso** | Lo que el cliente necesita no lo cubre ningún caso de uso (intención `OUT_OF_SCOPE`).     |
| **Frustración**        | `classify` detecta sentimiento muy negativo en el mismo mensaje en que pide el asesor.    |

Si no se cumple ninguna, el agente responde con un texto fijo que dice qué puede
resolver él y que, si igual prefiere un asesor, lo vuelva a pedir. Ese
ofrecimiento queda registrado en el estado (`human_offer_at`), y es lo que activa
la condición **Insiste** en el siguiente pedido. Así el cliente nunca queda sin
salida: como máximo, pide dos veces.

A mitad de un flujo aplica lo mismo: si el agente está confirmando un cargo y el
cliente pide un asesor por primera vez, el agente le ofrece terminar el trámite
("Estoy por registrar tu reclamo, ¿seguimos o prefieres un asesor?").

El `packet` del handoff guarda qué condición se cumplió.
