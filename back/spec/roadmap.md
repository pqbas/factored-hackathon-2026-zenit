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

## Phase 3: Estado de la conversación desde las señales del agente

**Goal:** que el back, único dueño de la conversación, sepa en cada turno quién
la atiende y qué turnos quedaron bloqueados, y actúe en consecuencia.

<!-- docs/limites-agente-back.md: el agente no guarda estado; lo señala en
     custom_outputs (handoff, blocked) y el back lo persiste. Depende de que
     el agente emita esas señales (sus Fases 6 y 7 reducidas). La forma exacta
     de custom_outputs está por confirmar con el agente. -->

- [ ] Cada conversación guarda quién la atiende (agente, cola o asesor) y el
      caso de uso activo, a partir de lo que señala el agente en cada turno.
- [ ] Un turno que el agente marca como bloqueado queda guardado como tal y
      no se le vuelve a mandar al agente en el historial.
- [ ] Si la conversación no la atiende el agente, el back guarda el mensaje
      del cliente y no llama al agente: sin mensaje vacío ni stream colgado.
- [ ] El historial y la pantalla de admin se pueden filtrar por quién atiende
      y por caso de uso.
- [ ] Se quitan el aviso de "background check" y los campos de etapa,
      intención y nombre del cliente del flujo anterior.

---

## Phase 4: Mensajes guardados sin datos sensibles

**Goal:** que la base del back nunca guarde datos sensibles del cliente en
claro.

<!-- docs/limites-agente-back.md: el back guarda los mensajes ya
     enmascarados. Decidido: el back enmascara con su propia lógica ANTES de
     guardar, porque routes/chat.ts guarda el mensaje del usuario antes de
     llamar al agente y no puede esperar su respuesta. Sensible = lo mismo que
     enmascara agent/src/llm/fallback.py: número de tarjeta (13 a 19 dígitos,
     con espacios o guiones) y el valor que sigue a cvv/contraseña/senha. Los
     tests replican los casos de agent/tests/unit/test_fallback.py para que las
     dos implementaciones no diverjan. -->

- [ ] Los mensajes del cliente y del agente se guardan con los datos
      sensibles enmascarados.
- [ ] El historial que el back le manda al agente sale de esos mensajes
      guardados, así que nunca lleva un dato sensible en claro.
- [ ] Los chats de la pantalla de admin muestran los mensajes enmascarados.

---

## Phase 5: Handoff a un asesor

**Goal:** que una conversación que el agente decide derivar quede registrada
en el back y pase a un humano, sin que el cliente repita su historia.

<!-- Antes era la Phase 6 del agente; ahora el back crea y guarda el handoff.
     El agente solo detecta la derivación y manda el resumen en
     custom_outputs. Modelo de referencia: agent/docs/07-handoff.md (tabla
     handoffs, handled_by, mensaje system), adaptado a la base del back. -->

- [ ] Cuando el agente señala un handoff, el back registra el caso con su
      resumen y motivo, y la conversación pasa a la cola de asesores.
- [ ] El historial del chat muestra el aviso de derivación.
- [ ] El front obtiene los mensajes nuevos de una conversación, incluidos los
      del asesor, solo si la conversación es del cliente de la sesión.
- [ ] Dos señales de handoff seguidas en la misma conversación no crean dos
      casos abiertos.

---

## Phase 6: API de la consola del asesor

**Goal:** que la consola del asesor en el front pueda tomar, responder y cerrar
casos derivados.

<!-- Antes dependía de las rutas /handoffs del agente; ahora la API es del
     back y el contrato lo define el back para el front. -->

- [ ] El asesor ve la bandeja de casos pendientes, ordenada por prioridad.
- [ ] El asesor abre un caso con su resumen y el historial del chat.
- [ ] El asesor toma el caso, responde y lo cierra indicando si vuelve al
      agente.
- [ ] Solo un usuario del grupo de asesores puede usar estas rutas, y su
      identidad sale del login, nunca del cuerpo de la petición.

---

## Phase 7: Asignación de asesores

**Goal:** que cada caso derivado llegue a un asesor disponible con el perfil
correcto, sin tomarlo a mano.

<!-- Antes era la Phase 7 del agente. Reglas de referencia:
     agent/docs/08-asignacion-de-asesores.md (especialidad e idioma). -->

- [ ] Cada handoff se asigna a un asesor disponible por especialidad e
      idioma.
- [ ] Dos handoffs simultáneos nunca toman al mismo asesor.
- [ ] El asesor ve los casos que tiene asignados.

---

## Phase 8: Conexión con el agente desplegado

**Goal:** que el chat desplegado en Databricks converse con el agente
desplegado, no con un endpoint de ejemplo.

<!-- Depende de la Phase 8 del agente, que ahora despliega sin Lakebase. Sin
     decidir: App + /invocations vía API_PROXY o serving endpoint
     agent/v1/responses, y cómo se autentica una App contra la otra. -->

- [ ] El chat desplegado llega al agente desplegado con el historial, el
      token y la conversación en cada turno.
- [ ] Los logs del backend no muestran el token de sesión del cliente.
