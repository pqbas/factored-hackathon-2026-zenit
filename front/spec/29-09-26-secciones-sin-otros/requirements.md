# Requirements: Secciones con nombre real, sin "Otros"

La vista Agente AI y la Bandeja dejan de tener una sección "Otros". Hoy caen ahí:

- en Agente AI, todo chat cuyo `useCase` no es un caso conocido;
- en la Bandeja, todo chat sin motivo de derivación.

Cada chat va ahora a una sección que dice por qué está ahí, con lo que el back ya manda en `/api/advisor/conversations`: `useCase`, `intent` y `handoff`. Esta fase es solo del front.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. Agente AI mantiene sus secciones por caso, en este orden: Reclamo, Cancelación de producto, Estado de un reclamo y Consultas generales. Usan los mismos colores y la misma regla por `useCase`.
2. La Bandeja mantiene sus secciones por motivo de derivación, en este orden: Reclamo, Cancelación de producto y Estado de un reclamo. Después vienen los motivos desconocidos, con su nombre tal cual.
3. En, Con asesor y Resueltas siguen sin secciones. Filtros, contadores y URLs no cambian.

And it changes in these ways:

4. En Agente AI, un chat sin caso conocido va a una de estas dos secciones, que se muestran en ese orden después de Consultas generales:
   - "Fuera de alcance": el último intent del chat es `OUT_OF_SCOPE` o `COMMERCIAL`. Incluye los turnos que bloqueó el guardrail por reglas, que el agente marca `OUT_OF_SCOPE`.
   - "Sin motivo aún": todo lo demás. Es decir, solo hubo saludo, menú, despedida o un pedido de asesor sin derivación, o el chat todavía no tiene intent.
5. En la Bandeja, un chat sin motivo de derivación va a "Tomada por un asesor", al final. Es el chat que un asesor tomó desde Agente AI sin que David lo derivara.
6. La etiqueta "Otros" no aparece en ninguna vista de la consola. La sección "Otras" del panel de métricas no se toca.
7. El asunto de la fila y la etiqueta del encabezado muestran "Fuera de alcance" para esos chats. Un chat "Sin motivo aún" sigue sin asunto, como hoy.

## 2. Decisions

- De dónde sale cada sección:
  - El caso sale de `useCase`, que el back solo llena con GENERAL_INQUIRY, COMPLAINT, CASE_STATUS o RETENTION (las rutas del agente que pasan por `load_context`) y conserva el último.
  - Fuera de alcance, comercial y saludo nunca llenan `useCase`: para esos casos se lee `intent`, el último intent del chat, que ya viene en la respuesta. No hace falta ningún cambio en el back.
- Un chat con un caso sigue en la sección del caso aunque después diga algo fuera de alcance. El caso es lo que el asesor necesita saber, y esa es la regla del back para `useCase`.
- COMMERCIAL va a "Fuera de alcance" porque David no atiende temas comerciales y responde igual que a un tema fuera de alcance (`_OUT_OF_MENU_INTENTS` en el agente).
- Confirmado por w1:p1 (29/09): solo el guardrail por reglas marca `OUT_OF_SCOPE`. Un turno que bloquea Jev o el LLM conserva su intent original, y el chat no expone ninguna marca de "bloqueado" (la marca vive en `Message.blocked`). Ese chat va a la sección de su intent. Se deja así por alcance del hackathon.
- El back (fase de w1:p1) va a usar el intent como caso cuando el agente no mande `use_case`, nunca va a pisar un caso real y va a reiniciar el caso al reabrirse un chat cerrado. El front no cambia por eso: sigue leyendo `useCase` y, si no hay caso, `intent`.
- "Sin motivo aún" va al final de Agente AI, porque son los chats que menos necesitan al asesor.
- "Tomada por un asesor" usa el violeta y el ícono de persona, igual que "Pidió un asesor". "Fuera de alcance" y "Sin motivo aún" usan el estilo neutro, con íconos distintos.

## 3. Context

- `spec/roadmap.md`: nueva Phase 23, "Secciones con nombre real".
- Back:
  - `back/server/src/agent-reply.ts` (`updateChatAgentState`: `useCase` e `intent`);
  - `agent/configs/routing.yaml` (intents y destinos);
  - `agent/src/graph/nodes/classify.py` (el guardrail por reglas marca `OUT_OF_SCOPE`).
- Existing patterns:
  - `src/lib/advisor.ts` (`davidSectionOf`, `groupByDavidSection`, `groupByHandoffReason`, `sectionLabel`, `reasonTagOf`);
  - `src/components/conversations/use-case-style.tsx` (`handoffReasonStyle`, `HandoffReasonChip`).
