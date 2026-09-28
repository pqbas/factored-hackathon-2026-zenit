# Roadmap

## Built so far

- Quien entra con el login de Databricks Apps puede chatear con el agente y ver
  la respuesta en streaming, con razonamiento, llamadas a herramientas y citas.
- Cada usuario ve en la barra lateral solo sus propios chats, agrupados por
  fecha, y puede retomarlos o borrarlos.
- El historial se puede filtrar por estado, intención y nombre de cliente
  (restos de un flujo anterior que el agente bancario ya no llena).
- El usuario puede editar un mensaje y regenerar la respuesta, y marcar un chat
  como público o privado.

---

<!--
  Tipos de usuario que se quieren tener:
  - Cliente del banco: chatea con el agente y ve solo sus chats.
  - Asesor: atiende las conversaciones que el agente deriva a un humano.
  - Admin: ve las conversaciones de todos los usuarios.
  Hoy solo existe un tipo de usuario: la sesión no trae rol.
-->

## Phase 1: Vista de conversaciones estilo WhatsApp, con datos mock (Complete)

**Goal:** ver cómo va a quedar la pantalla de conversaciones antes de
conectarla a datos reales.

- [x] Desde el chat se llega a una pantalla aparte con la lista de clientes a
      la izquierda y la conversación a la derecha, como WhatsApp Web.
- [x] La lista se puede buscar por nombre y muestra el último mensaje, la hora
      y los no leídos.
- [x] La conversación muestra los mensajes del cliente y del agente con hora y
      separadores por día, y deja escribir mensajes que solo quedan en pantalla.
- [ ] La pantalla se usa bien en móvil y en modo oscuro.

Modo oscuro revisado; móvil sin revisar. También entraron: riel de secciones
(Agente / Chats), barra lateral unificada, historial de ejemplo del cliente en
Agente y la quita de los filtros viejos del historial.
Shipped en PR #<n>.

---

## Phase 1b: Selector de cliente demo en el chat

**Goal:** que el agente sepa con qué cliente demo habla el chat.

<!-- Depende de la Fase 1 del back: GET /api/demo-customers y sessionToken en
     el body de POST /api/chat. -->

- [ ] El usuario elige un cliente demo antes de empezar a chatear.
- [ ] Cada mensaje del chat va con el token de ese cliente.
- [ ] Si el token es inválido o venció, el chat muestra la respuesta de
      "inicia sesión" que da el agente.

---

## Phase 2: Roles y navegación por rol

**Goal:** que cada usuario vea las pantallas de su rol (cliente, asesor o
admin) y ninguna otra.

<!-- Depende de que el back exponga el rol en /api/session. Propuesta del back:
     ADMIN_EMAILS (y una lista equivalente para asesores) contra el email de
     X-Forwarded-Email; más adelante, grupos de Databricks. -->

- [ ] La app sabe el rol del usuario al cargar la sesión.
- [ ] El admin y el asesor ven en el menú el acceso a su pantalla; el cliente
      no lo ve.
- [ ] Entrar por URL a una pantalla de otro rol muestra "sin acceso".

---

## Phase 3: Vista admin con conversaciones reales

**Goal:** que un admin revise las conversaciones de cualquier usuario sin poder
modificarlas.

<!-- Depende de GET /api/admin/chats (mismos params que /api/history más
     userId) y GET /api/admin/chats/:id/messages, detrás de requireAdmin. -->

- [ ] La vista de conversaciones muestra las de todos los usuarios, de la más
      reciente a la más antigua, con el email de cada usuario.
- [ ] El admin filtra la lista por usuario.
- [ ] El admin abre una conversación y la lee completa en modo solo lectura.

---

## Phase 4: Consola del asesor

**Goal:** que un asesor tome una conversación derivada, responda al cliente y
la cierre.

<!-- Depende de las rutas /handoffs del agente (agent/docs/07-handoff.md §7.4)
     y de la Fase 4 del back. Esa fase deja abierto si la consola vive en back
     o en front: este roadmap asume que vive en front. -->

- [ ] El asesor ve la bandeja de casos pendientes, ordenada por prioridad.
- [ ] El asesor abre un caso con su resumen y el historial del chat.
- [ ] El asesor toma el caso, responde al cliente y lo cierra indicando si
      vuelve al agente.
