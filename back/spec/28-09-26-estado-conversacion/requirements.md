# Requirements: Estado de la conversación desde las señales del agente

Con esta fase, el back guarda en cada conversación quién la atiende, el caso de
uso y el idioma que reporta el agente, marca los turnos bloqueados para no
volver a mandárselos, y deja de llamar al agente cuando la conversación la
atiende un humano. Es la parte del back de `docs/limites-agente-back.md`: el
agente no guarda estado y lo señala en `custom_outputs`. El registro del
handoff (caso, resumen, asesor) llega en la Fase 5; acá solo cambia quién
atiende.

## 1. Contrato con el agente (propuesta, a confirmar en su Fase 7)

En cada turno, el agente adjunta `custom_outputs` al **último evento
`response.output_item.done`** del stream, y en modo no streaming, a la
respuesta. Hoy el back ya lee `custom_outputs` de cualquier evento SSE y se
queda con el último (`providers-server.ts`), así que la posición exacta no
rompe nada, pero el último `output_item.done` es la convención.

```json
{
  "thread_id": "<id del chat>",
  "use_case": "GENERAL_INQUIRY" | null,
  "intent": "GENERAL_INQUIRY" | "GREETING" | ... | null,
  "language": "es" | "pt" | ... | null,
  "blocked": false,
  "handoff": null | { "reason": "customer_request", "summary": "..." }
}
```

| Campo      | Qué hace el back                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `use_case` | Lo guarda en `Chat.useCase` (el intent de la ruta, tal cual; `null` si el turno no tiene caso).                   |
| `intent`   | Lo guarda en `Chat.intent`.                                                                                       |
| `language` | Lo guarda en `Chat.language`.                                                                                     |
| `blocked`  | Si es `true`, marca como bloqueados el mensaje del cliente y la respuesta del agente de ese turno.                |
| `handoff`  | Si no es `null`, pone `Chat.handledBy = 'human_queue'`. En la Fase 5 además crea el caso con `reason` y `summary`. |
| `thread_id`| No lo usa: el back ya sabe el id del chat.                                                                        |

El agente no manda `handled_by`: no guarda estado, así que no puede saber quién
atiende. Eso lo decide el back. Un campo que falta o que llega con otro tipo se
ignora y no cambia lo guardado.

## 2. Functional requirements

Después de esta fase, el sistema debe seguir haciendo lo que hace hoy:

1. Un chat nuevo lo atiende el agente y funciona igual que hoy.
2. `/api/history` y `/api/admin/chats` mantienen la paginación y el filtro
   `userId`.

Y cambia en estas cosas:

3. `Chat` gana `handledBy` (`'ai_agent' | 'human_queue' | 'human_agent'`,
   por defecto `'ai_agent'`), `useCase` y `language`. `Message` gana `blocked`
   (por defecto `false`). Se borran las columnas `stage` y `customerName`.
4. Al terminar cada turno, el back guarda `useCase`, `intent` y `language` de
   los `custom_outputs`.
5. Si `blocked` es `true`, el mensaje del cliente y la respuesta de ese turno
   quedan con `blocked = true`, y el historial que el back le manda al agente
   en los turnos siguientes no los incluye. El chat los sigue mostrando.
6. Si `handoff` no es `null`, el chat pasa a `handledBy = 'human_queue'`.
7. Si `handledBy` no es `'ai_agent'`, `POST /api/chat` guarda el mensaje del
   cliente y no llama al agente. Responde con un stream que solo trae una
   parte de datos `data-conversation-state` con `{ handledBy }` y ningún
   mensaje del asistente, y no guarda un mensaje vacío.
8. `/api/history` y `/api/admin/chats` aceptan los filtros `handledBy` y
   `useCase`, y dejan de aceptar `status` y `customer`, que dependían de los
   campos borrados. `intent` se mantiene.
9. Se borran `POST /api/internal/background-check-received` y el código de
   "workflow" del flujo anterior.

## 3. Decisions

- El back deriva `handledBy` de la señal `handoff` en lugar de recibirlo del
  agente, porque el agente no tiene estado (`docs/limites-agente-back.md`).
- Se reutiliza la columna `intent` y se borran `stage` y `customerName`. Nunca
  los llenó el agente bancario, y el front ya dejó de filtrar por ellos.
- Los turnos bloqueados se guardan y se muestran, pero no se reenvían. Así el
  historial para auditoría queda completo y el agente no vuelve a procesar el
  mensaje que rechazó.
- En modo efímero (sin base) no hay dónde guardar el estado: no se marcan
  bloqueos y siempre se llama al agente. Es aceptable porque producción usa
  base.
- La respuesta sin agente mantiene el protocolo de stream del AI SDK (una parte
  `data-*`) en lugar de un JSON o un 202, para que el `useChat` del front no la
  trate como error.
- Quitar los filtros `status` y `customer` cambia los params de
  `/api/admin/chats`, pero no la forma de la respuesta. Se le avisa al front.
- El registro del handoff (tabla, resumen, asesor, aviso de derivación en el
  chat) queda para la Fase 5.

## 4. Context

- `spec/roadmap.md`: Phase 3.
- `docs/limites-agente-back.md`: contrato por request y responsabilidades.
- `agent/spec/roadmap.md`: Phase 7, que emite `custom_outputs` con
  `thread_id`, `use_case`, `intent`, `language`, `blocked` y `handoff`.
- Patrones existentes:
  - `packages/ai-sdk-providers/src/providers-server.ts:224-240`: lectura de
    `custom_outputs` del SSE (`getAndClearWorkflowMetadata`).
  - `server/src/routes/chat.ts:296-310`: guardado del estado en `onFinish`.
  - `packages/db/src/queries.ts`: `getChats` y `chatScopeCondition`.
  - `packages/db/migrations/0002_*.sql`: migración aditiva de la Fase 2.
