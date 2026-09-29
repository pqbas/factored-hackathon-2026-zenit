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
Shipped en PR #3.

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
Shipped en PR #5.

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
spec. Shipped en PR #6.

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

## Phase 1b: Selector de cliente demo en el chat (Complete)

**Goal:** que el agente sepa con qué cliente demo habla el chat.

<!-- Contrato del back (rama feat/identidad-cliente-conversacion):
     GET /api/demo-customers → { customers: [{ token, label }] }, 5 clientes
     (demo-expired y demo-closed prueban errores). POST /api/chat acepta
     sessionToken (string de 1 a 256, opcional): va en CADA mensaje porque el
     back no lo guarda, y un string vacío da 400. -->

- [x] El usuario elige un cliente demo antes de empezar a chatear.
- [x] Cada mensaje del chat va con el token de ese cliente; sin cliente
      elegido no se manda el campo (nunca un string vacío).
- [x] Si el token es inválido, venció o no viene, el chat muestra la respuesta
      de "inicia sesión" que da el agente, sin lógica propia en el front.

Los checks manuales contra el agente real quedan para el usuario. Shipped en
PR #9.

---

## Phase 1c: El chat del cliente durante un handoff (Complete)

**Goal:** que el cliente vea cuándo lo atiende un asesor y reciba sus mensajes
en el mismo chat.

<!-- Consume la Fase 3 (estado en POST /api/chat) y la Fase 5 del back
     (GET /api/messages/:id?after=, handledBy en /api/chat/:id). -->

- [x] El chat muestra los avisos de sistema del corte ("Te atiende un
      asesor.", "Volviste con David.", …).
- [x] Mientras `handledBy` no sea `ai_agent`, el chat no espera respuesta del
      agente y avisa que responde un asesor.
- [x] Los mensajes nuevos del asesor aparecen solos (polling al GET del back).
- [x] Cuando el asesor devuelve la conversación, el chat vuelve al agente.

Además, con David atendiendo el chat relee su estado cada 10 s, para notar que
un asesor lo tomó aunque el cliente no escriba (nota de contrato en el roadmap
del back, Fase 5). Shipped en PR #24.
---

## Phase 5: Roles y navegación por rol (Complete)

**Goal:** que cada usuario vea las pantallas de su rol (cliente, asesor o
admin) y ninguna otra.

<!-- Contrato aprobado (va en el PR de la Fase 2 del back, junto a la API
     admin): GET /api/session → { user: { email, name?, preferredUsername?,
     role: 'admin' | 'advisor' | 'customer' } } o { user: null }. Un rol por
     usuario, precedencia admin > advisor > customer (ADMIN_EMAILS,
     ADVISOR_EMAILS). El rol solo decide qué mostrar; el back sigue validando
     (403 en /api/admin). El admin también puede usar la consola del asesor.

     Matriz de acceso (definida por el usuario):
     | Sección del riel             | customer | advisor | admin |
     | Asistente (chat)             |    sí    |   sí    |  sí   |
     | Mis productos (cuenta)       |    sí    |   no    |  sí   |
     | Chats (consola del asesor)   |    no    |   sí    |  sí   |
     | Admin (todas las conversac.) |    no    |   no    |  sí   |
     Back: requireAdmin en /api/admin; requireAdvisor (advisor o admin) en la
     API de la consola; cuenta/productos solo customer y admin. -->

- [x] La app sabe el rol del usuario al cargar la sesión.
- [x] El riel muestra solo las secciones que la matriz permite al rol.
- [x] Entrar por URL a una pantalla de otro rol muestra "sin acceso".

Probado con el rol real del back (PR #15). Shipped en PR #16.

---

## Phase 6: Vista admin con conversaciones reales (Complete, reemplazada por la Fase 8)

**Goal:** que un admin revise las conversaciones de cualquier usuario sin poder
modificarlas.

<!-- Es una sección propia del riel ("Admin", solo admin), separada de Chats,
     que es la consola del asesor. -->

<!-- Contrato del back (Fase 2 del back, rama
     feat/pqbas-back-phase2-admin-conversaciones, sin mergear):
     GET /api/admin/chats?limit=&starting_after=&ending_before=&status=&intent=&customer=&userId=
       → { chats, hasMore }; cada chat trae userId y userEmail (null en chats
       anteriores a la migración); orden createdAt desc.
     GET /api/admin/users → { users: [{ userId, userEmail }] }, por email.
     GET /api/admin/chats/:id/messages → como GET /api/messages/:id.
     Errores: 401 sin sesión, 403 forbidden:chat si no es admin (ADMIN_EMAILS),
     404 not_found:chat, 204 sin base de datos. -->

- [x] La vista de conversaciones muestra las de todos los usuarios, de la más
      reciente a la más antigua, con el email de cada usuario.
- [x] El admin filtra la lista por usuario.
- [x] Un chat sin email del dueño (anterior a la fase del back) se muestra como
      "Sin email" y sigue abriéndose.
- [x] El admin abre una conversación y la lee completa en modo solo lectura.
- [x] Un usuario que no es admin ve "sin acceso" cuando el back responde 403.

También quitó del historial las insignias viejas (stage/intent/customerName).
Shipped en PR #18.

---

## Phase 7: Consola del asesor con datos reales (Complete)

**Goal:** que un asesor tome una conversación derivada, responda al cliente y
la cierre.

<!-- Consume la API de asesores del back (/api/advisor/*, Fase 5 del back,
     PR #22): back/spec/28-09-26-consola-asesor/requirements.md §1. -->

- [ ] El asesor ve la bandeja de casos pendientes, ordenada por prioridad.
- [ ] El asesor abre un caso con su resumen y el historial del chat.
- [x] El asesor toma el caso, responde al cliente y lo cierra indicando si
      vuelve al agente.

La bandeja ordena por fecha y filtra por estado (Abiertas, Sin atender, Mías,
Con David, Cerradas); la API no trae prioridad ni resumen del caso, así que
esas dos quedan pendientes. Solo quien tiene tomada la conversación escribe;
el admin puede forzar. Fuera del primer corte: etiquetas, imágenes, adjuntos y
no leídos. Shipped en PR #23.

---

## Phase 8: El admin supervisa desde Chats (Complete)

**Goal:** una sola pantalla de conversaciones: el asesor atiende y el admin
supervisa en solo lectura.

<!-- Contrato: Fase 5b del back (back/spec/28-09-26-admin-supervisa/).
     Reemplaza la vista Admin de la Fase 6; /api/admin/* desaparece. -->

- [x] No hay sección Admin; `/admin` lleva a Chats.
- [x] El admin ve todas las conversaciones, filtra por estado y por usuario y
      las lee sin poder actuar.
- [x] El asesor atiende como hoy, sin forzar conversaciones ajenas.

La vista Admin de la Fase 6 quedó reemplazada por Chats. Shipped en PR #28.

---

## Phase 9: Consola estilo Notion Mail (Complete)

**Goal:** que el asesor vea de un vistazo qué pide atención, agrupado por caso
de uso.

<!-- Diseño aprobado: artboards H, I y J del lienzo
     https://claude.ai/artifact/SfN8i51oncvvSj5dskfiH9. Sin cambios de API
     salvo lastMessage (PR #29 del back). -->

- [x] Vistas a la izquierda: Bandeja, una por caso de uso (icono y color) y
      los estados Sin atender, Mías y Resueltas; el admin suma el filtro de
      usuario.
- [x] La Bandeja agrupa por caso de uso, con "Otras" al final.
- [x] Filas de una línea: punto si está sin atender, avatar, nombre, robot si
      la atiende David, último mensaje del cliente (el asunto queda de
      tooltip), estado y hora.
- [x] La conversación se abre al lado de la lista y se cierra con la X.

Fuera de alcance / futuro: mensajes no leídos (la API no los trae; el punto
marca "Sin atender").

Incluye la consola "con menos ruido" (estado solo cuando pide atención).
Shipped en PR #33.

---

## Phase 10: Contadores en las vistas de la consola (Complete)

**Goal:** que el asesor vea cuánto hay en cada vista sin abrirla.

<!-- GET /api/advisor/conversations/counts (back, fix/pqbas-back-inbox-counts):
     { total, byUseCase, withoutUseCase, unattended, mine, resolved }. -->

- [x] Cada vista (Bandeja, casos de uso, Sin atender, Mías, Resueltas) muestra
      su número a la derecha; se oculta si es 0 y "Sin atender" se resalta.
- [x] Los números se refrescan con el polling de la bandeja y tras cada acción.

Shipped en PR #35.

---

## Phase 11: Datos reales (Complete)

**Goal:** que la app muestre la data real del banco para el despliegue.

- [x] Mis productos lee GET /api/products del cliente demo elegido, con
      estados de carga, cliente vencido y reintento.
- [x] La barra del chat muestra solo conversaciones reales.

Fuera de alcance / futuro: el nombre real del cliente en la consola (el back
lo deja para después del deploy) y los totales con monedas mezcladas.
Shipped en PR #37.

---

## Phase 12: Ajustes de producción (Complete)

**Goal:** que el admin pueda atender y que la demo no confunda mientras David piensa.

- [x] En Chats el admin tiene los mismos controles que el asesor (David ON/OFF,
      Tomar, responder, Resolver) y la vista Mías, sin perder la supervisión
      (Bandeja completa y filtro por usuario). Si la tiene otro, solo lo ve.
- [x] Indicador de "escribiendo" en la burbuja de David hasta el primer texto,
      con "David está consultando tus datos…" pasados 3 s; también en la consola.
- [x] El chip del cliente demo dice "Cliente demo: …" con un tooltip que
      explica que elige qué cliente del banco simular (chat y Mis productos).

Shipped en PR #42.

---

## Phase 13: Bandeja solo con casos humanos (Complete)

**Goal:** que la Bandeja del asesor muestre solo lo que necesita a una persona.

- [x] La Bandeja (y los casos de uso) muestran solo las conversaciones derivadas
      o en manos de un humano, agrupadas por caso de uso.
- [x] Nueva vista "Atendidas por David" con su contador, para ver las
      conversaciones autónomas e intervenir si hace falta.
- [x] Con la Bandeja vacía: "No hay casos para atender. David está atendiendo N
      conversaciones", con link a esa vista.
- [x] Los estados se llaman Con AI, En espera, Con asesor y Resuelta en vistas,
      filas y encabezado (docs/flujo-atencion.md §5); la vista de David es "Con AI".

Shipped en PR #44.

---

## Phase 14: Panel de métricas (Complete)

**Goal:** que el admin vea cuánto resuelve la IA sola y cuánto necesita a un asesor.

- [x] Sección "Métricas" en el riel, solo para el admin, con rango hoy / 7 días / 30 días.
- [x] Tarjetas: % resuelto por la IA de punta a punta, resueltas por la IA, por un
      asesor y asistidas.
- [x] Desglose por caso de uso con los colores de la consola y tendencia diaria
      en barras apiladas (IA / asistidas / asesor).
- [x] Estados de carga, sin resoluciones y error con reintento.
- [x] Los días son los del navegador (zona IANA, `tz`): un cierre a las 22:30 en
      Lima cuenta en ese día, no en el siguiente UTC.

Shipped en PR #49.

---

## Phase 15: Contexto del cliente en la consola (Complete)

**Goal:** que el asesor vea la historia del cliente con el banco sin salir de la conversación.

- [x] Panel "Contexto del cliente" al lado de la conversación abierta, con el botón
      "Contexto" para abrirlo y cerrarlo (se recuerda).
- [x] Pestañas Casos, Contactos y Llamadas (transcripción desplegable), leídas
      del banco y traducidas al español.
- [x] Estados de carga, sin cliente del banco y error con reintento, sin
      bloquear la conversación.
- [x] En pantallas de menos de 1600 px el panel ocupa el lugar de la lista.
- [x] Refleja tal cual lo registrado en el banco: pestañas Casos, Interacciones
      (tipo, canal, motivo, resuelta, escalada, sentimiento) y Transcripciones
      (idioma, intenciones, temas y texto de cliente y agente), traducidos 1 a 1.
- [x] Cada interacción con transcripción tiene "Ver transcripción", que la abre
      dentro de la interacción; la pestaña Transcripciones sigue como lista completa.

Shipped en PR #50.

---

## Phase 16: Nombre del cliente del banco en la consola (Complete)

**Goal:** que el asesor vea a quién atiende por su nombre, no por el email de la app.

- [x] Fila y encabezado muestran customerName, con avatar e iniciales de ese nombre;
      el email queda chico en el encabezado y como tooltip en la fila.
- [x] Sin customerName (sin sesión de cliente o mientras el banco responde) se
      muestra el email; la búsqueda también encuentra por nombre.

Shipped en PR #54.

---

## Phase 17: Chat del cliente según el cliente demo (Complete)

**Goal:** que el chat del cliente se sienta el del cliente demo elegido, no el del usuario de la app.

- [x] La barra de conversaciones muestra solo los chats del cliente demo elegido y
      se refresca al cambiarlo (`/api/history?sessionToken=`).
- [x] El saludo usa el nombre del cliente demo ("Buenas noches, Daniela").
- [x] Las tarjetas sugeridas son las opciones reales del menú de David: saldo y
      movimientos de tarjeta, cuentas de ahorro, reclamo y más opciones.

Shipped en PR #64.
