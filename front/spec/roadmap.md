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

## Phase 2: Identidad visual "Sereno estilo Mac" (Complete)

**Goal:** que la app deje de verse como una plantilla de chat y transmita la
calma y amplitud de una app nativa de Mac.

<!-- Referencia visual: artboards "D · Sereno estilo Mac" (claro y oscuro) del
     lienzo https://claude.ai/artifact/SfN8i51oncvvSj5dskfiH9 -->

- [x] Toda la app usa la paleta sereno (oscura por defecto, con variante clara),
      la tipografía del sistema y esquinas redondeadas suaves.
- [x] El riel y la barra lateral forman un solo panel, y el contenido flota como
      una hoja con margen y sombra suave.
- [x] La pantalla de inicio del agente saluda al usuario por su nombre, ofrece
      cuatro acciones y recuerda que el banco nunca pide contraseña, NIP ni CVV.
- [x] Los textos de Agente están en español.
- [x] La vista de Chats usa la misma paleta.

También entraron: color principal celeste, botón de modo claro/oscuro en el
riel y un solo avatar de usuario (en el riel). Fase hecha sin carpeta de spec.
Shipped en PR #<n>.

---

## Phase 3: Mis productos, con datos mock (Complete)

**Goal:** que el cliente vea de un vistazo todo lo que tiene en el banco, como
en la app de cualquier banco.

<!-- Los datos mock siguen el esquema de las tablas `products` y `transactions`
     del dataset LATAM Bank (data/pipeline/tables.py). -->

- [x] Desde el riel se llega a "Mis productos", con los productos agrupados en
      cuentas, tarjetas, créditos e inversiones y el saldo de cada uno.
- [x] Un resumen muestra el dinero disponible, lo que se debe, lo invertido y
      los últimos movimientos.
- [x] Al elegir un producto se ven su saldo, sus datos (número, tasa, fechas,
      estado) y sus movimientos; en tarjetas de crédito, cuánto del límite se usa.

Los datos son de la clienta CUS00000322 del dummy del dataset. La categoría del
gasto (`transaction_category`) no se muestra todavía. Fase hecha sin carpeta de
spec. Shipped en PR #<n>.

---

## Phase 4: Consola del asesor estilo CRM, con datos mock (Complete)

**Goal:** que el asesor atienda desde Chats las conversaciones que el
asistente le deriva, con el estado y el tema de cada una a la vista.

<!-- Referencia visual: artboard "E · Consola del asesor (chats)" del lienzo
     https://claude.ai/artifact/SfN8i51oncvvSj5dskfiH9 -->

- [x] El asesor prende o apaga el asistente en cada conversación; con el
      asistente apagado, el asesor escribe y el asistente no responde.
- [x] Cada conversación muestra su estado (sin atender, con asistente, en
      atención, resuelto) y la lista se filtra por estado.
- [x] Cada conversación lleva etiquetas con el tema detectado y el producto
      relacionado, y el asesor puede agregar más.
- [x] Las imágenes que manda el cliente se ven en el chat, con los datos
      sensibles (CVV, códigos de seguridad) ocultos.
- [x] El chat avisa cuando el asistente deriva al asesor y con qué motivo.
- [x] El asesor tiene respuestas rápidas, puede adjuntar archivos y saltar al
      último mensaje.
- [x] El encabezado muestra el cliente con su ID y el teléfono enmascarado.

El estado va como punto y texto, el filtro de estado vive en un menú "Filtros"
y las respuestas rápidas se abren con el botón del rayo. Shipped en PR #7.

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

## Phase 5: Roles y navegación por rol

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

## Phase 6: Vista admin con conversaciones reales

**Goal:** que un admin revise las conversaciones de cualquier usuario sin poder
modificarlas.

<!-- Depende de GET /api/admin/chats (mismos params que /api/history más
     userId) y GET /api/admin/chats/:id/messages, detrás de requireAdmin. -->

- [ ] La vista de conversaciones muestra las de todos los usuarios, de la más
      reciente a la más antigua, con el email de cada usuario.
- [ ] El admin filtra la lista por usuario.
- [ ] El admin abre una conversación y la lee completa en modo solo lectura.

---

## Phase 7: Consola del asesor con datos reales

**Goal:** que un asesor tome una conversación derivada, responda al cliente y
la cierre.

<!-- Depende de las rutas /handoffs del agente (agent/docs/07-handoff.md §7.4)
     y de la Fase 4 del back. Esa fase deja abierto si la consola vive en back
     o en front: este roadmap asume que vive en front. -->

- [ ] El asesor ve la bandeja de casos pendientes, ordenada por prioridad.
- [ ] El asesor abre un caso con su resumen y el historial del chat.
- [ ] El asesor toma el caso, responde al cliente y lo cierra indicando si
      vuelve al agente.
