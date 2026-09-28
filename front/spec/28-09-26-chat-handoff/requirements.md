# Requirements: El chat del cliente durante un handoff

Con esta fase, el chat del cliente muestra cuándo lo atiende una persona y
recibe los mensajes del asesor sin recargar. Consume lo que ya está en `main`
(Fase 3 del back, PR #19) y el contrato de la Fase 5 del back:

- `POST /api/chat` con la conversación en manos de una persona responde
  `start` + `data-conversation-state { handledBy }` + `finish`, sin mensaje del
  agente.
- `GET /api/chat/:id` trae `handledBy` (`ai_agent` | `human_queue` |
  `human_agent`).
- `GET /api/messages/:id?after=<id>` → mensajes posteriores; `after`
  desconocido → 400. Los mensajes traen `senderType` (`human_agent` para el
  asesor, `system` para los avisos); los viejos, `null`.
- Avisos del back: "Te atiende un asesor.", "Otro asesor continúa la
  conversación.", "Volviste con el asistente.", "La conversación se cerró."

## 1. Functional requirements

Después de esta fase, el chat debe seguir haciendo lo que hace hoy:

1. Con el agente, el chat hace streaming, reanuda y guarda igual que antes.

Y cambia en estas cosas:

2. Si el back responde solo con el estado, el chat no queda esperando ni deja
   un mensaje vacío del asistente, y no intenta reanudar el stream.
3. Mientras `handledBy` no sea `ai_agent`, un aviso sobre el campo dice "Te
   pasamos con un asesor…" (`human_queue`) o "Te atiende un asesor."
   (`human_agent`).
4. En ese estado, el chat trae cada 4 s los mensajes nuevos (`after`) y el
   estado del chat, y los agrega sin duplicar. Si `after` da 400, recarga la
   lista completa. Cuando vuelve a `ai_agent`, deja de consultar.
5. Al terminar cada respuesta del agente, el chat relee el estado, porque el
   agente puede haber derivado la conversación en ese mismo turno.
6. Los mensajes del asesor se ven con el icono de persona y la etiqueta
   "Asesor"; los avisos `system`, centrados en gris.
7. Al abrir un chat que ya está con un asesor, el aviso y el polling arrancan
   solos.

## 2. Decisions

- Polling cada 4 s (dentro de los 3 a 5 del contrato) y solo mientras atiende
  una persona, para no cargar al back en el caso normal.
- `senderType` viaja en `metadata` del mensaje de UI; un mensaje sin
  `senderType` se lee por `role`, como pide el contrato.
- Sin historial activado (modo efímero) no hay polling: no hay mensajes
  guardados que leer.
- La consola del asesor (Fase 7) es otra rama; esta fase no depende de ella.

## 3. Context

- `spec/roadmap.md`: Phase 1c.
- `back/server/src/routes/chat.ts`: respuesta con solo el estado.
- Existing patterns: `src/components/chat.tsx` (`onData`, `onFinish`),
  `src/lib/advisor.ts` de la Fase 7 (incremento con `after`).
