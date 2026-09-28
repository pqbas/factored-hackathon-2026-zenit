# Plan: Consola del asesor estilo CRM, con datos mock

Rama: `feat/pqbas-front-phase4-consola-asesor-mock`, desde `main`. Solo
utilidades de Tailwind v4 y tokens de `src/index.css`; nada de `style={{}}` ni
CSS propio.

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `src/mocks/conversations.ts` | existing | Modified: tipos y datos con handoff, etiquetas, imágenes, respuestas rápidas |
| `public/mock-attachments/comprobante-transferencia.svg` | — | New: comprobante con el código de seguridad ya tapado |
| `src/lib/conversations.ts` | existing | Modified: `maskPhone`, `conversationStatus`, `countByStatus`, `filterByStatus`, `conversationReducer` |
| `src/pages/ConversationsPage.tsx` | existing | Modified: `useReducer`, filtros de estado |
| `src/components/conversations/conversation-list.tsx` | existing | Modified: filtros, chips de estado y tema |
| `src/components/conversations/conversation-view.tsx` | existing | Modified: arma encabezado, avisos, mensajes y composer |
| `src/components/conversations/conversation-header.tsx` | — | New: cliente, interruptor, etiquetas, estado, Resolver |
| `src/components/conversations/status-chip.tsx` | — | New: chip de estado y chip de etiqueta |
| `src/components/conversations/message-bubble.tsx` | — | New: burbuja de texto o imagen, y aviso `system` |
| `src/components/conversations/advisor-composer.tsx` | — | New: respuestas rápidas, adjuntar, campo y enviar |
| `tests/unit/conversations.test.ts` | existing | Modified: casos nuevos |
| `tests/integration/conversation-reducer.test.ts` | — | New |
| `back/tests/e2e/conversations.test.ts` | existing | Modified: casos nuevos |

---

## Group 1: Datos mock

1. En `src/mocks/conversations.ts`:
   - `MockMessage.from` pasa a `'customer' | 'assistant' | 'advisor' | 'system'`
     (hoy `'agent'` → `'assistant'`).
   - `MockMessage` suma `attachment?: { url: string; alt: string; redactions:
     string[] }`.
   - `MockConversation` suma `fullName`, `phone`, `channel: 'WhatsApp' | 'App'`,
     `handledBy: 'ai_agent' | 'human_queue' | 'human_agent'`, `closed: boolean`,
     `topic: string`, `product?: string`, `tags: string[]`, `handoffReason?:
     string`. `name` pasa a ser el nombre completo (`Daniela Sosa`, etc.) y se
     mantienen los cinco `customerId`.
   - Santiago y Daniela quedan `human_queue` con un mensaje `system` de
     derivación; Daniela suma el comprobante con `redactions: ['código de
     seguridad']`. Javier queda `ai_agent`; "Cliente cerrado" queda `closed`.
   - Exporta `QUICK_REPLIES: string[]` con tres o cuatro textos (ej. "Ya revisé
     tu comprobante", "Se acredita en 24 h hábiles", "Abrir reclamo").
2. Crear `public/mock-attachments/comprobante-transferencia.svg`: comprobante
   con monto, fecha, destino enmascarado y un rectángulo negro donde iría el
   código de seguridad.

---

## Group 2: Lógica pura

3. En `src/lib/conversations.ts`:
   - `maskPhone(phone)`: deja el código de país y de área y los últimos cuatro
     dígitos (`+54 9 11 5555 4821` → `+54 9 11 •••• 4821`).
   - `type ConversationStatus = 'assistant' | 'waiting' | 'advisor' |
     'resolved'` y `conversationStatus(c)`: `closed` → `resolved`; si no, por
     `handledBy`.
   - `STATUS_LABEL` con Con asistente, Sin atender, En atención, Resuelto.
   - `filterByStatus(conversations, filter: 'all' | 'waiting' | 'advisor')` y
     `countByStatus(conversations)`.
   - `conversationReducer(state, action)` con las acciones `select`,
     `toggleAssistant`, `send`, `attach`, `resolve` y `addTag`:
     - `toggleAssistant` con `ai_agent` → `human_agent` y `closed: false`; con
       `human_queue` o `human_agent` → `ai_agent`.
     - `send` y `attach` agregan un mensaje `advisor`; con `human_queue` además
       pasan a `human_agent`; con `ai_agent` no hacen nada.
     - `resolve` → `closed: true`, `handledBy: 'ai_agent'` y un mensaje `system`
       "Conversación resuelta · vuelve al asistente".
     - `addTag` ignora vacíos y repetidos.
4. `filterConversations` y `sortByLastMessage` no cambian.

---

## Group 3: UI

5. `src/components/conversations/status-chip.tsx`: `StatusChip({status})` con
   `bg-tint-amber` (Sin atender), `bg-tint-blue` (Con asistente),
   `bg-sidebar-accent text-primary` (En atención), `bg-tint-green` (Resuelto);
   `TagChip({label, tone})`. `data-testid="status-chip"`.
6. `conversation-list.tsx`: debajo del buscador, tres botones de filtro
   (`data-testid="status-filter-{all|waiting|advisor}"`, `aria-pressed`), con
   el conteo en Sin atender. Cada fila suma `StatusChip` y `TagChip` del tema.
7. `conversation-header.tsx`: avatar, `fullName`, `customerId · maskPhone ·
   channel`. Interruptor como `<button role="switch" aria-checked>`
   (`data-testid="assistant-switch"`) con el texto "Asistente ON/OFF". Segunda
   línea: etiquetas, "+ Etiqueta" (un `<input>` inline que agrega con Enter),
   `StatusChip` y botón "Resolver" (`data-testid="resolve-button"`, deshabilitado
   si ya está resuelta). Incluye el `SidebarToggle`.
8. `message-bubble.tsx`:
   - `MessageBubble`: cliente a la izquierda (`bg-wa-customer-bubble`);
     asistente y asesor a la derecha (`bg-wa-agent-bubble`) con remitente arriba
     ("Asistente" / "Tú"). Conserva `data-testid` `bubble-customer` y
     `bubble-agent` (este para asistente y asesor) y suma `bubble-advisor`.
   - Con `attachment`: `<img>` redondeado y, si hay `redactions`, línea con
     `LockIcon` "Ocultamos un {redaction}" (`data-testid="redaction-note"`).
   - `SystemNotice`: pill centrada `bg-tint-amber` (`data-testid="system-notice"`).
9. `advisor-composer.tsx`: fila de respuestas rápidas
   (`data-testid="quick-reply-{i}"`, pone el texto en el campo); botón adjuntar
   (`<input type="file" accept="image/*" hidden>`); botón de respuestas rápidas
   que muestra u oculta la fila; campo con placeholder "Escribe al cliente…" o,
   con el asistente en ON (`ai_agent`), "El asistente está respondiendo…" y
   `disabled`.
10. `conversation-view.tsx`: usa el header, el aviso de estado debajo (Con
    asistente: `bg-tint-blue`, "El asistente está respondiendo…"; Sin atender:
    `bg-tint-amber`, "Esperando a un asesor · escribe para tomarla"; En
    atención: `bg-sidebar-accent`, "Estás atendiendo…"), las burbujas y el composer. Suma
    el botón "Ir al último mensaje" (`data-testid="scroll-to-bottom"`), visible
    cuando el scroll está a más de 120 px del final; se calcula en `onScroll`.
11. `ConversationsPage.tsx`: pasa de `useState` a `useReducer(conversationReducer)`
    sobre `structuredClone(MOCK_CONVERSATIONS)`, suma el filtro de estado y
    mantiene la búsqueda.

---

## Group 4: Tests

12. `tests/unit/conversations.test.ts`: `maskPhone`, `conversationStatus`,
    `filterByStatus`, `countByStatus`; actualiza el test de `MOCK_CONVERSATIONS`
    (cinco clientes, al menos uno `human_queue`, uno con `redactions`).
13. Crear `tests/integration/conversation-reducer.test.ts`: el reducer sobre
    `MOCK_CONVERSATIONS` con los helpers: tomar → escribir → resolver; `send`
    ignorado con el asistente en ON; `send` en una Sin atender la toma; `addTag` sin duplicados; el conteo de Sin
    atender baja al tomar una conversación.
14. `back/tests/e2e/conversations.test.ts`: actualiza el test de enviar
    (primero apagar el asistente, placeholder "Escribe al cliente…") y suma:
    filtro Sin atender, interruptor, Resolver, aviso de derivación, nota de
    datos ocultos, respuesta rápida en el campo y "+ Etiqueta".
