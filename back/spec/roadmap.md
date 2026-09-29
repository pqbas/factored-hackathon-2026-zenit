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

## Phase 2: Conversaciones de todos los usuarios para admin (Complete)

**Goal:** que un operador pueda revisar las conversaciones de cualquier usuario
desde la pantalla de admin del front.

<!-- La pidió el front (su Fase 6). No depende del agente. Hoy nadie escribe
     la tabla User y el chat solo guarda userId, así que el email del dueño
     hay que empezar a guardarlo; los chats viejos quedan sin email. -->

- [x] Un admin lista las conversaciones de todos los usuarios, con los mismos
      filtros y la misma paginación que su propio historial, y puede filtrar
      por usuario.
- [x] Cada conversación de la lista muestra el email de su dueño.
- [x] Un admin obtiene la lista de usuarios con conversaciones, para el filtro.
- [x] Un admin abre los mensajes de una conversación ajena.
- [x] Un usuario que no es admin recibe 403 en esas rutas.
- [x] Quién es admin se configura con una lista de emails, sin tocar código.
- [x] La sesión informa el rol del usuario (admin, asesor o cliente) para que
      el front decida qué mostrar; admin y asesor se configuran con listas de
      emails, y si un email está en las dos gana admin.

<!-- Matriz de acceso por rol (decisión del usuario, 28-09-26). El front solo
     usa el rol para el menú; el back valida cada ruta:
     - customer: su chat con el asistente y su cuenta (Mis productos).
     - advisor: su chat con el asistente y la consola del asesor (lee, toma,
       responde, devuelve y cierra). No ve Mis productos.
     - admin: el asistente, Mis productos y Chats con todas las acciones del
       asesor (toma, responde, devuelve y cierra) más la supervisión: ve todas
       las conversaciones y filtra por cliente (decisión del usuario, 28-09-26,
       revisa la Fase 5b).
     Rutas: consola (lectura, take, messages, release) → advisor o admin, con
     el mismo 409 entre ellos; lista de usuarios de la consola → solo admin.
     /api/admin/* se eliminó en la Fase 5b (todo vive bajo /api/advisor/*). Rutas de cuenta/productos → customer o admin. -->

Shipped en PR #15.

---

## Phase 3: Estado de la conversación desde las señales del agente (Complete)

**Goal:** que el back, único dueño de la conversación, sepa en cada turno quién
la atiende y qué turnos quedaron bloqueados, y actúe en consecuencia.

<!-- docs/limites-agente-back.md: el agente no guarda estado; lo señala en
     custom_outputs (handoff, blocked) y el back lo persiste. Depende de que
     el agente emita esas señales (sus Fases 6 y 7 reducidas). La forma exacta
     de custom_outputs está por confirmar con el agente. -->

- [x] Cada conversación guarda quién la atiende (agente, cola o asesor) y el
      caso de uso activo, a partir de lo que señala el agente en cada turno.
- [x] Un turno que el agente marca como bloqueado queda guardado como tal y
      no se le vuelve a mandar al agente en el historial.
- [x] Si la conversación no la atiende el agente, el back guarda el mensaje
      del cliente y no llama al agente: sin mensaje vacío ni stream colgado.
- [x] El historial y la pantalla de admin se pueden filtrar por quién atiende
      y por caso de uso.
- [x] Se quitan el aviso de "background check" y los campos de etapa,
      intención y nombre del cliente del flujo anterior.

Shipped en PR #19.

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

## Phase 5: Consola del asesor con toma manual (Complete)

**Goal:** que un asesor o admin tome una conversación, le responda al cliente y
la devuelva al asistente o la cierre, sin depender del handoff automático del
agente.

<!-- Absorbe la vieja "API de la consola" y la parte del handoff que no
     depende del agente (los mensajes del asesor llegan al chat). Regla del
     usuario: dos personas nunca responden el mismo chat. Contrato en
     spec/28-09-26-consola-asesor/requirements.md. -->

- [x] El asesor ve la bandeja de conversaciones y la filtra por quién la
      atiende, a quién está asignada y si está abierta o cerrada.
- [x] La bandeja por defecto trae solo casos humanos abiertos (en cola o con
      un asesor); las que David atiende solo se piden con handledBy=ai_agent
      y se cuentan aparte en counts.aiAgent (decisión del usuario, 28-09-26).
- [x] El asesor toma una conversación: el asistente deja de responder y queda
      asignada a él. Si ya la tiene otro asesor, recibe un conflicto.
- [x] Solo quien tiene tomada la conversación le puede responder al cliente,
      y el cliente ve esos mensajes en su chat casi en tiempo real.
- [x] El asesor devuelve la conversación al asistente o la cierra.
- [x] Cuando el cliente se despide y el agente responde con intent GOODBYE,
      la conversación queda resuelta (closedAt) si la atiende el agente; si
      el cliente vuelve a escribir, se reabre (decisión del usuario,
      28-09-26).
- [x] Un admin puede quitarle una conversación a otro asesor o devolverla; un
      asesor no.
- [x] Si el asesor toma la conversación mientras el agente responde, esa
      respuesta no se guarda como turno del agente.
- [x] Solo asesores y admins usan estas rutas, y la identidad sale del login.

Shipped en PR #22.

Nota de contrato (front, Fase 1c): mientras `handledBy = ai_agent`, el chat
del cliente relee `GET /api/chat/:id` cada 10 s para enterarse si un asesor
toma una conversación en la que el cliente no está escribiendo; con una
persona atendiendo consulta mensajes y estado cada 4 s. Es una lectura más por
chat abierto cada 10 s.

---

## Phase 5b: El admin supervisa, no atiende (Complete)

**Goal:** que el admin vea todas las conversaciones desde la consola sin poder
tomarlas ni responder, y que solo los asesores atiendan.

<!-- Decisión del usuario, 28-09-26. Spec en
     spec/28-09-26-admin-supervisa/. -->

- [x] La bandeja y los mensajes de la consola los leen asesores y admins; el
      admin ve todas las conversaciones, incluidas las que atiende David y las
      cerradas, y filtra por cliente.
- [x] Tomar, responder y devolver es solo para asesores; el admin recibe 403.
      Revisado después (decisión del usuario, 28-09-26): el admin también
      toma, responde y devuelve, con el mismo 409 que entre asesores.
- [x] Ya no existe tomar una conversación ajena a la fuerza.
- [x] La vista admin separada desaparece: la lista de clientes para el filtro
      sale de la consola, y las rutas /api/admin se eliminan.

Fuera de alcance / futuro: liberar una conversación que un asesor tomó y
abandonó (rescate o timeout).

Shipped en PR #27.

---

## Phase 6: Handoff automático del agente

**Goal:** que una conversación que el agente decide derivar entre sola a la
bandeja de la consola, con su resumen, sin que el cliente repita su historia.

<!-- Depende de la Fase 7 del agente (custom_outputs.handoff con reason,
     summary y facts). Reutiliza la consola de la Fase 5: tomar, responder y
     devolver no cambian. Modelo de referencia: agent/docs/07-handoff.md. -->

- [ ] Cuando el agente señala un handoff, el back registra el caso con su
      motivo, resumen y datos, y la conversación entra a la bandeja.
- [ ] La bandeja ordena por prioridad y muestra el resumen del caso.
- [ ] El historial del chat muestra el aviso de derivación.
- [ ] Dos señales de handoff seguidas en la misma conversación no crean dos
      casos abiertos.

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

## Phase 8: Conexión con el agente desplegado (Complete)

**Goal:** que el chat desplegado en Databricks converse con el agente
desplegado, no con un endpoint de ejemplo.

<!-- Depende de la Phase 8 del agente, que ahora despliega sin Lakebase. Sin
     decidir: App + /invocations vía API_PROXY o serving endpoint
     agent/v1/responses, y cómo se autentica una App contra la otra. -->

- [x] El chat desplegado llega al agente desplegado con el historial, el
      token y la conversación en cada turno.
- [ ] Los logs del backend no muestran el token de sesión del cliente.

Diferido: `databricksFetch` todavía registra el body completo (con
`custom_inputs.session_token`). Con los tokens demo no expone nada real;
queda para cuando haya login real.

Shipped en PR #38.

---

## Phase 9: Métricas de resolución (Complete)

**Goal:** que el admin vea cuántas conversaciones resuelve la IA de punta a
punta, cuántas un asesor y cuántas con ayuda humana.

<!-- Pedido del usuario, 28-09-26. Definición en docs/flujo-atencion.md §6. -->

- [x] Cada cierre registra un evento de resolución: despedida con David
      atendiendo → `ai`; Resolver del asesor → `human`. Cada reapertura y
      cierre suma otro evento.
- [x] `hadHuman` marca si hubo derivación o toma desde la última apertura;
      se resetea cuando el cliente reabre.
- [x] El admin consulta `GET /api/advisor/metrics?from&to`: total, contenidas
      por la IA, resueltas por un asesor y asistidas, por caso de uso y por
      día.

---

## Phase 10: Contexto del cliente en la consola (Complete)

**Goal:** que el asesor o el admin vea, al abrir una conversación, quién es el
cliente y su historia con el banco.

<!-- Pedido del usuario, 28-09-26. Definición en docs/flujo-atencion.md §4. -->

- [x] Cada conversación guarda el cliente de la sesión (token demo →
      customer_id), al crearse y en cada turno si cambia.
- [x] `GET /api/advisor/conversations/:id/customer-context` devuelve el
      cliente, sus últimos 10 contactos, sus últimas 5 transcripciones de
      llamadas (enmascaradas con las mismas reglas que el agente) y sus casos,
      leídos del warehouse en paralelo; 204 si el chat no tiene cliente.
