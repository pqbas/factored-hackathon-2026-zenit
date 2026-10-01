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

## Phase 6: Handoff automático del agente (Complete: lo esencial)

**Goal:** que una conversación que el agente decide derivar entre sola a la
bandeja de la consola, con su resumen, sin que el cliente repita su historia.

<!-- Depende de la Fase 7 del agente (custom_outputs.handoff con reason,
     summary y facts). Reutiliza la consola de la Fase 5: tomar, responder y
     devolver no cambian. Modelo de referencia: agent/docs/07-handoff.md. -->

- [x] Cuando el agente señala un handoff, el back registra el caso con su
      motivo, resumen y datos, y la conversación entra a la bandeja.
- [x] La consola muestra el motivo en la fila y el resumen y los datos
      verificados en el detalle y en la línea de tiempo del cliente.
- [x] Al resolver o devolver, el caso se cierra.
- [x] Dos señales de handoff seguidas en la misma conversación no crean dos
      casos abiertos.

Fuera de alcance / futuro: ordenar la bandeja por prioridad y el aviso de
derivación en el historial del chat.

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
- [x] La consola muestra al cliente del banco por su nombre (customerName, de
      customer_360, una consulta por cliente y reintento si falla); las rutas
      del cliente no lo traen.
- [x] La consola agrupa por cliente: una fila por cliente con su conversación
      más reciente (`?groupBy=customer`), contadores por cliente y todas sus
      conversaciones en orden cronológico (decisión del usuario, 28-09-26).
- [x] Si el agente no está disponible (502/503/504 o sin conexión), el turno
      queda en una cola en Postgres y un worker lo responde cuando vuelve; se
      descarta si un asesor toma el chat y vence a los 20 min con un aviso
      (decisión del usuario, 28-09-26).

---

## Phase 11: Filtro por motivo de derivación y conversación en curso (Complete)

**Goal:** que la consola filtre y cuente por el motivo real de la derivación
(complaint, retention, case_status) y muestre de cada cliente lo que pasa
ahora, con casos sembrados en local para probarlo.

<!-- Pedido del usuario vía w1:p4, 29-09-26. Spec en
     spec/29-09-26-filtro-motivo-handoff/. -->

- [x] La consola filtra por el motivo del handoff (`handoffReason`) y cuenta
      por motivo (`byHandoffReason`) y "Con asesor" (`withAdvisor`).
- [x] En la vista agrupada, las vistas abiertas toman la conversación en curso
      de cada cliente y Resueltas la cerrada más reciente.
- [x] Eduardo (`demo-mx-2`) es cliente demo, y cada chat expone su cliente
      guardado (`demoCustomerToken`) para el selector del front.
- [x] `npm run seed:console` siembra en local todos los casos de la consola.

Pendiente: sembrar el caso de Eduardo (`case_status`) cuando el agente local
lo derive (bloque c del agente).

Shipped en PR #78.

---

## Phase 12: David se pausa después de derivar (Complete)

**Goal:** que David no diga nada más en una conversación derivada hasta que un
humano la devuelva.

<!-- Regla permanente del usuario vía w1:p4, 29-09-26. Spec en
     spec/29-09-26-pausa-tras-handoff/. El lado del agente (custom_outputs.paused)
     lo hace w1:p3. -->

- [x] Una conversación con handoff abierto o que no atiende David no llama al
      agente ni guarda respuestas, en vivo, en la cola o en reintentos.
- [x] Derivar o tomar el chat cancela los turnos pendientes, y los mensajes
      simultáneos se encolan en vez de ir al agente en paralelo.
- [x] Contrato con el agente: `custom_inputs.handled_by` en cada llamada, y un
      turno `paused` no se guarda.
- [x] Lo guardado se recorta tras la frase de derivación, el vencimiento abre
      un handoff `agent_unavailable` y devolver a David cierra el handoff.

Shipped en PR #80.

---

## Phase 13: Datos principales del cliente en el contexto (Complete)

**Goal:** que el panel de contexto de la consola empiece con los datos
principales del cliente, tal como están en el banco.

<!-- Pedido del usuario vía w1:p4, 29-09-26. Spec en
     spec/29-09-26-perfil-cliente/. -->

- [x] `customer-context` trae `profile`: id, país y ciudad, segmento, estado,
      fecha de alta, productos activos, contacto y canal preferido.
- [x] Si el perfil no se puede leer, `profile` viene `null` y el resto del
      contexto no cambia.
- [x] Las rutas del cliente nunca traen `profile`.
- [x] `scripts/uc-grants.sh` reúne los grants del SP, incluido `SELECT` sobre
      `bank_silver.customers`.

Shipped en PR #81. Desplegado a prod con `scripts/uc-grants.sh` el 29-09-26
(main `1f099d5`).

---

## Phase 14: Runner de evaluación (Complete)

**Goal:** medir con muestra y denominador cuánto resuelve David de forma
segura, a qué latencia y a qué costo (bloques 1, 2 y 3 de
`spec/29-09-26-evidencia-hackathon/`).

<!-- Pedido del usuario vía w1:p4, 29-09-26. Spec en
     spec/29-09-26-runner-evaluacion/. -->

- [x] Los 40 casos de `docs/flujo-atencion.md` §7 como archivos en
      `scripts/eval/cases/`.
- [x] `npm run eval` corre cada caso 3 veces por el back local, marca
      pasa/falla y escribe el reporte `.json` y `.md` con las métricas del
      hackathon.
- [x] Cada turno del agente queda en `TurnMetric`, y `/api/advisor/metrics`
      expone la latencia p50/p95 y el costo estimado.

Línea base 40×3 (clasificador llm, prompt 68747d24cacf) en
`scripts/eval/results/2026-09-29-llm.md`: 86/120 pasan, 0 inseguros.

Shipped en PR #86 (merge `a77e94f8`). El guard de grounding del agente
(`custom_outputs.guard`) queda en `TurnMetric` y en el reporte: PR #87.

Anexos: set held-out de 20 casos (congelado antes de las correcciones del
agente), `--set`/`--label`, `eval:compare`, cancelación sin confirmación y
movimientos con pregunta previa. Corrida después (agente main `d4559fa`):
dev 95.8% y holdout 95.0% de corridas que pasan, 0 inseguros
(`scripts/eval/results/comparacion.md`). Shipped en PR #95.

---

## Phase 15: Datos del banco desde Lakebase (Complete)

**Goal:** que el agente y el back lean los datos del banco de copias de solo
lectura en Lakebase, sin la warehouse ni el MCP, para bajar el costo.

<!-- Decisión del usuario vía w1:p4, 29-09-26. Spec en
     spec/29-09-26-datos-banco-lakebase/. Las tools del agente las migra w1:p3. -->

- [x] Siete synced tables en modo snapshot en `bank_ro` (instancia
      `bank-assistant-chat-db`), en un pipeline, con refresco bajo demanda
      (`scripts/bank-ro/`).
- [x] Roles y grants de solo `SELECT`: el agente en sus tres tablas, el back en
      las siete.
- [x] El back lee productos, movimientos, perfil, contactos, transcripciones y
      casos de `bank_ro`, y deja de usar la warehouse.
- [x] Frescura, linaje y prueba de refresco en `docs/datos-banco-lakebase.md`.

Costo medido de un refresco completo: 0.361 DBU, USD 0.13.

Shipped en PR #89.

---

## Phase 16: El agente recibe solo la conversación actual (Complete)

**Goal:** que David lea la conversación actual y no el chat entero (decisión
del usuario, pedido de w1:p3).

<!-- Spec en spec/29-09-26-conversacion-actual/. -->

- [x] El `input` al agente lleva solo lo posterior al último cierre del chat
      (todo si nunca se cerró), en vivo y en la cola.
- [x] Un chat devuelto por el asesor sin cerrar va entero, con `[Asesor]`.

Shipped en PR #90.

---

## Phase 17: El caso de uso es el de la conversación en curso (Complete)

**Goal:** que la consola muestre el caso de la conversación en curso, sin
arrastrar el de una conversación cerrada.

<!-- Pedido del usuario vía w1:p4, 30-09-26. Spec en
     spec/30-09-26-caso-por-conversacion/. -->

- [x] Reabrir un chat cerrado reinicia `useCase`; el `ResolutionEvent` de la
      conversación cerrada conserva el suyo.
- [x] Dentro de una conversación, un turno sin caso no pisa el caso real (ya
      se cumplía).

Shipped en PR #94.

---

## Phase 18: El examen contra producción (Complete)

**Goal:** medir en prod la precisión, el p50 y el p95 con el holdout (pedido
explícito del usuario vía w1:p4, 30-09-26). Spec en
spec/30-09-26-eval-prod/.

- [x] `npm run eval --allow-prod` contra la App desplegada, con el token OAuth
      del usuario; `eval:cleanup` borra los chats de prueba por id (PR #97).
- [x] Tokens demo de la evaluación en los `app.yaml` de prod (PR #97).
- [x] Holdout 20×3 en prod, antes y después del fix de MLflow: pasan 88.3% y
      95.0%, 0 inseguros, p50/p95 2.0/3.7 s por turno
      (`scripts/eval/results/comparacion-prod.md`).

Shipped en PR #99. Pendiente: borrar de la base de prod los 120 chats de prueba (lo decide el
usuario; `npm run eval:cleanup`).

---

## Phase 19: Simulación diaria de tráfico en prod (Complete)

**Goal:** que prod se vea con tráfico real para la demo: 100 conversaciones
por día de clientes reales, sin repetir clientes entre días (pedido del
usuario vía w1:p4, 30-09-26). Spec en spec/30-09-26-simulacion-diaria/.

- [x] Sesiones de la simulación en `bank_sessions.sim_sessions`, con tokens
      aleatorios `sim-` por cliente y día, de solo lectura para el agente y el
      back, que fallan cerrado. El back resuelve `sim-` en el chat, los
      productos y el historial.
- [x] `npm run simulate:day` (mezcla del call center, ~20% pt, de 2 a 4
      mensajes, derivaciones en espera) y `npm run simulate:cleanup`.
- [x] Arreglo del test de métricas por el reinicio de `useCase` de #94.

Shipped en PR #106.

---

## Phase 20: Evolución de los ahorros del cliente (Complete)

**Goal:** que "Mis productos" muestre cómo evolucionó el ahorro del cliente en
los últimos 12 meses (decisión del usuario vía w1:p4, 30-09-26). El gráfico lo
hace w1:p6. Spec en spec/30-09-26-evolucion-ahorros/.

- [x] `GET /api/products/savings-history?sessionToken=`: una serie mensual
      por moneda, reconstruida hacia atrás desde el saldo de hoy con los
      movimientos Approved (`estimated: true`). Si una moneda pasa por un
      saldo negativo, no se devuelve.
- [x] Fixture de Daniela (demo-ar-1) con fechas relativas a `now()`.

Deuda: `sessionToken` en la URL termina en los logs, igual que en
`/api/products`.

---

## Phase 21: Movimientos por producto en /api/products (Complete)

**Goal:** cada tarjeta de "Mis productos" muestra sus propios movimientos
(bug de w1:p4, 30-09-26: la 1070 de Santiago salía vacía). Spec en
spec/30-09-26-movimientos-por-producto/.

- [x] `transactions` trae los últimos 10 de cada producto activo, no 10 en
      total. La forma es la misma, en una lista plana por fecha descendente.

---

## Phase 22: Back y front en AWS, con login de demo (Complete)

**Goal:** el mismo back de main, con el front adentro, corre en AWS App
Runner en paralelo a Databricks Apps (etapa 1 de
`spec/01-10-26-despliegue-aws/`, aprobada por el usuario vía w1:pB,
01-10-26). Spec en spec/01-10-26-aws-back/.

- [x] Modo password (`AUTH_MODE=password`): login con usuarios fijos y cookie
      firmada. En ese modo el back ignora los headers `X-Forwarded-*`.
- [x] Imagen Docker (`Dockerfile.back`) y scripts `scripts/aws/setup.sh` y
      `deploy.sh`; secretos en Secrets Manager.
- [x] Lakebase y el agente de Databricks con el service principal
      `bank-assistant-aws` (`scripts/aws/lakebase-grants.sql`).
- [x] `AGENT_QUEUE_WORKER=off` en AWS: la cola la contesta Databricks.
- [x] Servicio `bank-assistant-back` en us-west-2, verificado de punta a
      punta.

Pendiente: login corporativo (Cognito o SSO) en vez de los usuarios de demo.

