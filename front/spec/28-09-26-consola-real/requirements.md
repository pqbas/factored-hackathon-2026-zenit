# Requirements: Consola del asesor con datos reales

La consola de Chats (`/conversations`) deja los mocks y trabaja contra la API
de asesores del back: bandeja real, tomar y devolver una conversación (el
interruptor del asistente), responder al cliente y cerrar. Es el primer corte
de la estimación: sin etiquetas editables, sin imágenes ni adjuntos y sin no
leídos. Contrato (del coordinador; el definitivo llega con la spec del back):

- `GET /api/advisor/conversations?handledBy=&assignedTo=me&status=open|closed&limit=&starting_after=`
  → `{ chats, hasMore }`; cada chat trae `handledBy`, `assignedTo`,
  `assignedAt`, `closedAt`, `userEmail` y `useCase`.
- `GET /api/advisor/conversations/:id/messages?after=<msgId>` → mensajes con
  `senderType` (`customer` | `ai_agent` | `human_agent` | `system`) y
  `senderId` (email del asesor). `after` desconocido → 400.
- `POST .../:id/take` → `{ chat }`; 409 `{ code: 'conflict:chat', assignedTo }`
  si la tiene otro. Solo admin puede mandar `{ force: true }`.
- `POST .../:id/messages { text }` → 201 `{ message }`; 409 si no la tiene
  tomada quien escribe.
- `POST .../:id/release { outcome: 'returned_to_agent' | 'resolved', note? }`
  → `{ chat }`. "Cerrada" es `closedAt`, no un `handledBy`.

## 1. Functional requirements

Después de esta fase, la consola debe seguir haciendo lo que hace hoy:

1. Mismo layout y estilo: lista con buscador y menú Filtros, encabezado,
   burbujas, avisos del sistema, respuestas rápidas y botón para bajar.
2. Solo advisor y admin entran (matriz de la Fase 5).

Y cambia en estas cosas:

3. La bandeja sale de la API y se refresca cada 4 s. Filtros: Abiertas,
   Sin atender (`handledBy=human_queue`), Mías (`assignedTo=me`), Con
   asistente (`handledBy=ai_agent`) y Cerradas (`status=closed`).
4. El estado de cada conversación sale de `closedAt` y `handledBy`: Resuelto,
   Sin atender, En atención (y quién) o Con asistente.
5. Los mensajes se cargan al abrir y después solo los nuevos (`after`) cada
   4 s; si `after` da 400, se recargan completos.
6. Controles según el caso:
   - Con asistente: el interruptor está en ON; apagarlo toma la conversación.
   - Sin atender: botón "Tomar".
   - Tomada por mí: interruptor en OFF (prenderlo la devuelve al asistente) y
     "Resolver" (la cierra).
   - Tomada por otro: aviso "La atiende <email>"; un admin puede "Tomar de
     todos modos" (`force`).
7. El campo de texto solo se habilita si la conversación está abierta y
   `assignedTo` es el usuario actual (dos personas nunca responden el mismo
   chat).
8. Un 409 al tomar o responder muestra quién la tiene y refresca la bandeja.
9. Los mensajes del asesor muestran "Tú" si son míos y el email si son de otro
   asesor; los del agente, "Asistente".

## 2. Decisions

- La vista se arma sobre tipos propios del front (`src/lib/advisor.ts`) y no
  sobre `@chat-template/db`, porque el contrato todavía no está en los
  paquetes del back; cuando llegue se cambian los tipos por los del paquete.
- Se borran los mocks y el reducer de la Fase 4, porque la pantalla ya no los
  usa y dejarlos sería código muerto.
- Polling cada 4 s (entre los 3 y 5 del contrato) con SWR para la bandeja y un
  intervalo propio para los mensajes, porque los mensajes se piden por
  incremento (`after`) y se juntan sin duplicar por `id`.
- Etiquetas, imágenes, adjuntos, no leídos, teléfono y producto quedan fuera
  del primer corte: necesitan datos o almacenamiento que el back no tiene.
- Los e2e mockean la API con `page.route`; no se mergea antes que el back.

## 3. Context

- `spec/roadmap.md`: Phase 7.
- Existing patterns: la consola de la Fase 4 (`src/components/conversations/`),
  `src/lib/admin.ts` (fetch con estados, paginación), `src/lib/roles.ts`.
