# Límites entre el agente y el back

Estado: **decidido** (28-09-26). Reemplaza lo que digan en contra
`docs/agent_architecture.md` (checkpoint en Lakebase) y los docs 07, 08 y 11 de
`agent/docs/`.

## Regla

Una conversación se guarda en un solo lugar: la base del back. El agente es
una función `historial → respuesta`, sin memoria entre requests y sin base de
datos propia.

## Responsabilidades

| Tema                                   | Back (dueño de los datos)                                                                 | Agente (solo responde)                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Mensajes e historial                   | Los guarda en su Postgres (`Chat`, `Message`) y manda el historial completo en cada request | No guarda nada. Usa el historial que recibe                                     |
| Datos sensibles                        | Guarda los mensajes ya enmascarados                                                       | Enmascara todo el historial que recibe antes de pasarlo al LLM                  |
| Identidad                              | Resuelve el cliente y manda `custom_inputs.session_token`                                 | Valida el token en cada request                                                 |
| Estado de la conversación              | Guarda handoff, quién atiende y turnos bloqueados; decide si llama o no al agente          | Lo señala en `custom_outputs` (derivar, turno bloqueado)                        |
| Handoff y asignación de asesores       | Crea el handoff, asigna asesor, expone la API de la consola                               | Detecta el handoff y arma el resumen                                            |
| Idioma de la conversación              | Nada                                                                                      | Lo deduce del historial recibido (detector local, sin llamadas extra)           |
| Base de datos                          | Postgres local; Lakebase en producción                                                    | Ninguna. Se elimina el checkpointer de LangGraph y su Lakebase                  |

## Contrato por request

El back llama a `POST /invocations` con:

- `input`: el historial completo del chat más el mensaje nuevo, sin los turnos
  que el agente marcó como bloqueados.
- `context.conversation_id`: el id del chat. El agente lo usa solo para agrupar
  las trazas de MLflow, no para buscar estado.
- `custom_inputs.session_token`: el token del cliente elegido.

El agente responde el texto y, cuando aplica, `custom_outputs` con señales para
el back (por ejemplo `handoff` o `blocked`). El agente nunca le pide al back
estado guardado ni lee su base.

## Qué cambia

- **Agente:** usar todo `request.input` (con un tope de mensajes), compilar el
  grafo sin checkpointer, borrar `src/db/checkpointer.py` y la configuración de
  Lakebase, enmascarar el historial completo y deducir el idioma del historial.
  Sus Fases 6 y 7 se reducen a detectar el handoff y emitir `custom_outputs`; la
  Fase 8 despliega sin Lakebase.
- **Back:** guardar los mensajes enmascarados, guardar el estado de la
  conversación a partir de los `custom_outputs`, no reenviar turnos bloqueados, y
  quedarse con el handoff, la asignación de asesores y la API de la consola.
- **Front:** sin cambios de contrato; la consola del asesor consume la API del
  back.
