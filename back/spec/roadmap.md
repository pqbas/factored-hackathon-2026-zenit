# Roadmap

## Built so far

- Los usuarios que entran con el login de Databricks Apps pueden chatear con un
  endpoint de serving y ver la respuesta en streaming.
- Cada usuario ve solo su historial de chats y puede retomarlo. Con Lakebase el
  historial queda guardado; sin Lakebase vive en memoria.
- Si un stream se corta, se reanuda sin volver a llamar al modelo.
- El backend sirve la UI compilada desde `../front`. Toda la UI vive en el
  front: este repo solo expone la API.
- Quedan restos de un flujo anterior: la etapa, la intención y el nombre del
  cliente que se guardan en cada chat, y el aviso de "background check" en
  `/api/internal`.

---

## Phase 1: Identidad del cliente y conversación continua (Complete)

**Goal:** que el agente sepa qué cliente escribe y recuerde la conversación
entre turnos.

- [x] El usuario elige un cliente demo y cada mensaje llega al agente con su
      token de sesión.
- [x] Todos los turnos de un chat llegan al agente como la misma conversación.
- [x] Con un token inválido o vencido, el chat muestra la respuesta de "inicia
      sesión" que da el agente.
- [x] Un test comprueba que el token y el id de conversación llegan al agente.

"Sin token → inicia sesión" depende del fix del agente
(`fix/pqbas-agent-no-default-session`); el backend ya manda el request sin
token.

Shipped en PR #8.

---

## Phase 2: Conversaciones de todos los usuarios para admin

**Goal:** que un operador pueda revisar las conversaciones de cualquier usuario
desde la pantalla de admin del front.

<!-- La pidió el front (su Fase 6). No depende del agente. Hoy nadie escribe
     la tabla User y el chat solo guarda userId, así que el email del dueño
     hay que empezar a guardarlo; los chats viejos quedan sin email. -->

- [ ] Un admin lista las conversaciones de todos los usuarios, con los mismos
      filtros y la misma paginación que su propio historial, y puede filtrar
      por usuario.
- [ ] Cada conversación de la lista muestra el email de su dueño.
- [ ] Un admin obtiene la lista de usuarios con conversaciones, para el filtro.
- [ ] Un admin abre los mensajes de una conversación ajena.
- [ ] Un usuario que no es admin recibe 403 en esas rutas.
- [ ] Quién es admin se configura con una lista de emails, sin tocar código.

---

## Phase 3: Estado del agente en cada conversación

**Goal:** que el chat y la pantalla de admin sepan quién atiende cada
conversación y qué caso de uso está activo.

<!-- Depende de la Phase 6 del agente: custom_outputs en streaming con
     { thread_id, handled_by, use_case, intent, language, handoff_id }.
     use_case llega como el intent de la ruta (GENERAL_INQUIRY), no como UC-01.
     Hasta que exista el handoff, handled_by es siempre ai_agent. -->

- [ ] Cada conversación guarda quién la atiende (agente, cola o asesor) y el
      caso de uso activo, tal como los reporta el agente en cada turno.
- [ ] El historial y la pantalla de admin se pueden filtrar por quién atiende
      y por caso de uso.
- [ ] Se quitan el aviso de "background check" y los campos de etapa,
      intención y nombre del cliente del flujo anterior.

---

## Phase 4: El chat durante una derivación a asesor

**Goal:** que el front pueda mostrar cuándo atiende un humano y los mensajes
del asesor sin recargar la página.

<!-- Depende de la Phase 6 del agente: turno pasivo (stream sin texto, con
     custom_outputs.handled_by) y GET /conversations/{id}/messages. La forma
     de la respuesta la define el agente en su spec; no diseñar antes. La UI
     la hace el front. -->

- [ ] Un turno en una conversación derivada no deja un mensaje vacío del
      asistente ni un stream colgado.
- [ ] El front obtiene los mensajes nuevos de una conversación, incluidos los
      del asesor y el aviso de derivación, solo si la conversación es del
      cliente de la sesión.

---

## Phase 5: API de la consola del asesor

**Goal:** que la consola del asesor en el front pueda tomar, responder y cerrar
casos derivados.

<!-- Depende de la Phase 7 del agente (rutas /handoffs). El contrato lo
     comparte el agente en su spec de Phase 7; no diseñar los proxies contra
     una forma supuesta. -->

- [ ] El asesor ve la bandeja de casos pendientes, ordenada por prioridad.
- [ ] El asesor abre un caso con su resumen y el historial del chat.
- [ ] El asesor toma el caso, responde y lo cierra indicando si vuelve al
      agente.
- [ ] Solo un usuario del grupo de asesores puede usar estas rutas, y su
      identidad sale del login, nunca del cuerpo de la petición.

---

## Phase 6: Conexión con el agente desplegado

**Goal:** que el chat desplegado en Databricks converse con el agente
desplegado, no con un endpoint de ejemplo.

<!-- Depende de la Phase 8 del agente. Sin decidir: App + /invocations vía
     API_PROXY o serving endpoint agent/v1/responses, y cómo se autentica una
     App contra la otra. -->

- [ ] El chat desplegado llega al agente desplegado con el token y la
      conversación en cada turno.
- [ ] Los logs del backend no muestran el token de sesión del cliente.
