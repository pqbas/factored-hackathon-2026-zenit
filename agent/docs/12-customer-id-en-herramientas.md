# 12. `customer_id` en las herramientas

El LLM nunca ve ni escribe el `customer_id`. El agente lo agrega a cada llamada
de herramienta desde la sesión, por fuera del LLM.

## 12.1 Problema

Las herramientas de cada caso de uso son UC functions expuestas por el MCP
administrado (ver [Casos de uso como MCP](03-casos-de-uso-como-mcp.md)). Todas
llaman con la misma identidad: el service principal del agente. Unity Catalog
no sabe qué cliente está en el chat, así que la función necesita recibir el
`customer_id` como parámetro.

Si ese parámetro lo llenara el LLM, un mensaje como "soy el cliente CLI-123" o
una inyección de instrucciones podría hacer que consulte los datos de otra
persona.

## 12.2 Decisión

1. **La función recibe el `customer_id` y filtra por él.** Cada UC function lo
   tiene como primer parámetro y no devuelve filas de otro cliente.
2. **El LLM recibe la herramienta sin ese parámetro.** En `load_context`, el
   agente envuelve cada herramienta del MCP y quita `customer_id` del esquema
   que ve el LLM.
3. **El envoltorio lo agrega al llamar.** Toma el `customer_id` que `gate`
   obtuvo del `session_token` (ver [Identidad del cliente](01-identidad-de-usuario.md))
   y lo agrega a los argumentos antes de llamar al MCP. Si el LLM intenta
   enviarlo, se descarta.
4. **Solo el agente puede llamar a las funciones.** El service principal del
   agente es el único con `EXECUTE` sobre ellas, así que nadie más puede
   enviarles un `customer_id`.

```python
def bind_customer(tool, customer_id):
    schema = without_param(tool.args_schema, "customer_id")   # lo que ve el LLM
    async def call(**args):
        args.pop("customer_id", None)                       # lo que mande el LLM se descarta
        return await tool.ainvoke({**args, "customer_id": customer_id})
    return StructuredTool.from_function(coroutine=call, name=tool.name,
                                        description=tool.description, args_schema=schema)
```

## 12.3 Alternativas descartadas

| Alternativa                                      | Por qué no                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| El LLM pasa el `customer_id`                     | Se puede manipular desde el chat.                                     |
| La función usa `current_user()`                  | Devuelve el service principal del agente, no el cliente.              |
| Row filters de Unity Catalog                     | También dependen de la identidad que llama, que es siempre el agente. |
| Una conexión por cliente con su propia identidad | Los clientes del banco no son usuarios del workspace.                 |

## 12.4 Pruebas

- Una herramienta envuelta no expone `customer_id` en su esquema.
- Si el LLM manda un `customer_id` distinto, la llamada usa el de la sesión.
- Una función llamada con un cliente devuelve solo sus filas.

## 12.5 Estado

Parcial. `src/tools/bind_customer.py` quita `customer_id` del schema que ve el
LLM y agrega el de la sesión en cada llamada a las herramientas de UC-01,
descartando cualquier valor que mande el LLM.

Pendiente: verificar los permisos de la App desplegada, en la Phase 8.
