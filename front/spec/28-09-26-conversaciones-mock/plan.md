# Plan: Vista de conversaciones estilo WhatsApp (mock)

## Code changes

| Module                                              | Origin | Change                                                  |
| --------------------------------------------------- | ------ | ------------------------------------------------------- |
| `src/mocks/conversations.ts`                        | —      | New: tipos y datos mock de clientes y mensajes.         |
| `src/lib/conversations.ts`                          | —      | New: helpers puros (iniciales, agrupar por día, filtrar, formatear hora). |
| `src/pages/ConversationsPage.tsx`                   | —      | New: pantalla de dos paneles y estado local.            |
| `src/components/conversations/conversation-list.tsx`| —      | New: buscador y filas de clientes.                      |
| `src/components/conversations/conversation-view.tsx`| —      | New: encabezado, burbujas, separadores y caja de texto. |
| `src/App.tsx`                                       | —      | Modified: ruta `/conversations`.                        |
| `src/components/app-sidebar.tsx`                    | —      | Modified: acceso a "Conversaciones".                    |
| `src/index.css`                                     | —      | Modified: colores de burbujas y fondo, claro y oscuro.  |

---

## Group 1: Datos mock y helpers

1. Crear `src/mocks/conversations.ts`:
   - Tipos `MockMessage = { id: string; from: 'customer' | 'agent'; text: string; sentAt: string }`
     (ISO) y `MockConversation = { customerId: string; name: string; country?: string; unread: number; messages: MockMessage[] }`.
   - `MOCK_CONVERSATIONS` con los cinco clientes demo, en español, sobre temas
     bancarios (saldo, agregar beneficiario, aumento de límite, cuenta cerrada,
     sesión vencida). Entre 4 y 12 mensajes cada uno, repartidos entre hoy,
     ayer y días anteriores, para que se vean los separadores. Las fechas se
     calculan relativas a `new Date()` al cargar el módulo, para que "Hoy"
     siempre tenga mensajes.
   - Al menos dos clientes con `unread > 0`.

2. Crear `src/lib/conversations.ts` con funciones puras:
   - `getInitials(name)`: "Santiago · México" → "SM"; una palabra → sus dos
     primeras letras en mayúscula.
   - `filterConversations(conversations, query)`: por nombre, sin distinguir
     mayúsculas ni tildes.
   - `sortByLastMessage(conversations)`: el último mensaje más reciente primero.
   - `groupMessagesByDay(messages, now)`: devuelve `[{ label, messages }]` con
     label "Hoy", "Ayer" o la fecha (`d 'de' MMMM`, `date-fns` con locale `es`).
   - `formatListTime(iso, now)`: hora `HH:mm` si es de hoy, "Ayer" si es de
     ayer, `dd/MM/yyyy` si es anterior.

---

## Group 2: Pantalla

3. En `src/index.css`, agregar variables en `:root` y `.dark`:
   `--wa-agent-bubble`, `--wa-customer-bubble`, `--wa-chat-bg`,
   `--wa-list-active` y el color del doble check, y exponerlas como utilidades
   de Tailwind siguiendo cómo están declaradas las variables existentes.

4. Crear `src/components/conversations/conversation-list.tsx`:
   - Props: `conversations`, `selectedId`, `onSelect`, `query`, `onQueryChange`.
   - Encabezado "Chats" con un botón (ícono `MessageSquare`) que navega a `/`
     con el tooltip "Volver al chat con el agente".
   - Buscador con `Input` e ícono `Search`.
   - Filas con avatar de iniciales (color derivado del `customerId`), nombre,
     último mensaje en una línea (`truncate`), hora con `formatListTime` y
     contador de no leídos en un círculo verde.
   - `data-testid="conversation-row-<customerId>"` y `aria-selected` en la fila
     elegida.

5. Crear `src/components/conversations/conversation-view.tsx`:
   - Props: `conversation`, `onSend(text)`, `onBack` (solo en móvil).
   - Encabezado con avatar, nombre y, en móvil, un botón `ArrowLeft` que llama
     a `onBack`.
   - Cuerpo con fondo `--wa-chat-bg`, separadores de día centrados (con
     `groupMessagesByDay`) y burbujas: cliente a la izquierda, agente a la
     derecha, hora abajo a la derecha, `CheckCheck` en las del agente.
     `data-testid="bubble-customer"` y `data-testid="bubble-agent"`.
   - Scroll automático al último mensaje al abrir la conversación y al enviar.
   - Caja de texto con botón `SendHorizontal`. Enter envía; mensaje vacío no
     se envía.

6. Crear `src/pages/ConversationsPage.tsx`:
   - Estado local: `conversations` (copia de `MOCK_CONVERSATIONS`),
     `selectedId`, `query`.
   - `onSelect` pone `unread` en 0 para ese cliente.
   - `onSend` agrega un `MockMessage` con `from: 'agent'` y `sentAt` actual.
   - Desktop: dos paneles (lista de ~30 % de ancho, mínimo 320 px) con
     `h-dvh`. Móvil (`useIsMobile`): si hay `selectedId` se muestra solo la
     conversación, si no, solo la lista.
   - Sin cliente elegido en desktop: estado vacío con ícono y "Elige una
     conversación".

7. En `src/App.tsx`, agregar `<Route path="conversations" element={<ConversationsPage />} />`
   dentro de `RootLayout` y fuera de `ChatLayout`, para que no exija sesión ni
   muestre la barra lateral del chat.

8. En `src/components/app-sidebar.tsx`, agregar junto a "New Chat" un botón
   con ícono `MessagesSquare` y el texto "Conversaciones" que navega a
   `/conversations`.

---

## Group 3: Tests

9. Unit, en `tests/unit/conversations.test.ts` (Vitest):
   - `getInitials`, `filterConversations` (mayúsculas y tildes),
     `sortByLastMessage`, `groupMessagesByDay` (Hoy, Ayer, fecha) y
     `formatListTime` (hoy, ayer, anterior), con `now` fijo.
   - `MOCK_CONVERSATIONS` tiene cinco clientes, cada uno con al menos un
     mensaje, y al menos uno con mensajes de hoy.

10. Integration: no hay test en esta fase. El front no tiene setup de tests de
    componentes, y la unión lista → selección → conversación queda cubierta
    por el e2e del paso 11.

11. End-to-end, en `back/tests/e2e/conversations.test.ts` (Playwright contra el
    servidor real que sirve `front/dist`):
    - `/conversations` muestra cinco filas.
    - Buscar "dan" deja solo a Daniela.
    - Click en Santiago → aparecen burbujas de cliente y de agente, y la fila
      queda con `aria-selected=true`.
    - Una fila con no leídos pierde el contador al abrirla.
    - Escribir "Hola" y enviar → aparece una burbuja de agente nueva con ese
      texto.
    - El acceso "Conversaciones" de la barra lateral del chat lleva a
      `/conversations`.
