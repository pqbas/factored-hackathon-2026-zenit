# Requirements: Filtros por motivo de derivación y cliente demo fijo

Esta fase arregla dos cosas del front.

- **Filtros de la consola.** Los filtros "Casos de uso" dejan de listar intenciones del clasificador que nunca llegan a la Bandeja. Quedan solo los tres motivos de derivación de docs/flujo-atencion.md, cada uno con su contador. La vista "Mías" pasa a llamarse "Con asesor", para calzar con los cuatro estados del flujo.
- **Selector de cliente demo.** El cliente elegido deja de cambiar solo al pasar de una conversación a otra.

Se mantienen igual el shape del chat, el handoff y el contrato de mensajes. Lo nuevo del back son un parámetro de filtro, unos contadores y el cliente guardado de cada chat; los define w1:p1 en paralelo (ver Decisions).

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. La consola muestra un cliente por fila (groupBy=customer), y cada cliente cuenta todas sus conversaciones (`conversationCount`).
2. Bandeja, Con AI, En espera y Resueltas filtran y cuentan igual que hoy.
3. La tarjeta "Caso derivado por David" y la etiqueta del motivo en la fila siguen igual.
4. Un chat que ya tiene mensajes sigue fijo a su cliente: el selector queda bloqueado.
5. La barra de conversaciones y el saludo siguen al cliente demo elegido.

And it changes in these ways:

- Cada vista abierta (Bandeja, Con AI, En espera, Con asesor, filtros por motivo) toma por cliente su conversación en curso, la más reciente con `closedAt` nulo, y no la más reciente a secas. Eso vale para la fila, los filtros y todos los contadores de esas vistas. Resueltas toma la cerrada más reciente. Así, un cliente con una conversación abierta y otra más nueva ya resuelta sigue en la Bandeja con la abierta. Lo resuelve el back; el front muestra lo que devuelve (ajuste de la revisión de w1:p4).

6. La sección de filtros por motivo tiene exactamente tres: Reclamo (complaint), Cancelación de producto (retention) y Estado de un reclamo (case_status).
7. Cada filtro se evalúa solo sobre la conversación en curso del cliente: su última conversación no resuelta (`closedAt` nulo). Un cliente aparece en "Reclamo" si el handoff de esa conversación es complaint; sus conversaciones anteriores o ya resueltas no cuentan. El filtro lo aplica el back, con su parámetro.
8. Cada filtro muestra su contador, también cuando es 0. El contador cuenta clientes según el motivo de su conversación en curso.
9. En Estado, "Mías" pasa a "Con asesor" y filtra por `handledBy=human_agent`, las atienda quien las atienda. Su contador cuenta esas conversaciones.
10a. La etiqueta de la fila muestra solo el detalle del handoff, si hay: el tipo de reclamo (No reconoce el cargo / Cobro duplicado / Monto distinto) o el producto a cancelar (Tarjeta Crédito ••6262). Nunca repite el motivo ni muestra la intención del clasificador. Sin detalle, no hay etiqueta (ajuste de la revisión de w1:p4).
10b. La vista de las conversaciones que atiende David (`handledBy=ai_agent`) pasa a llamarse "Agente AI", en el item del sidebar y en el título de la vista. El estado de la fila ("Con AI", uno de los cuatro estados del flujo) no cambia (pedido del usuario).
10c. La tarjeta "Caso derivado por David" (resumen y ficha de datos verificados) sale de arriba del chat y pasa al panel "Contexto del cliente", como primera sección, arriba de las pestañas Casos, Interacciones y Transcripciones. El chat queda solo con los mensajes. El chip del motivo en el encabezado se queda. Si la conversación abierta tiene handoff, el panel Contexto se abre por defecto (pedido del usuario).
10d. El separador de cada conversación en la línea de tiempo muestra el motivo del handoff si esa conversación se derivó, y ningún chip si no. Nunca muestra la intención del clasificador (revisión de w1:p4).
10e. En la lista angosta (con un chat abierto), todas las filas muestran su estado, también "Con asesor" (revisión de w1:p4).
10f. En las filas de la consola, cuando un asesor tomó la conversación (`human_agent`), la columna del medio (la del robot de David, entre el nombre y la etiqueta de detalle) muestra un badge con ícono de persona y el usuario del asesor (la parte del email antes de la @, o "tú" si es quien mira). El estado de la derecha queda solo "Con asesor". En espera no lleva nada en esa columna. Vale para la lista ancha y la angosta; el encabezado de la conversación sigue diciendo quién la atiende (pedido del usuario).
10. La Bandeja agrupa por motivo del handoff (Reclamo / Cancelación de producto / Estado de un reclamo). Las conversaciones sin handoff van en "Otros".
11. El cliente elegido en el selector, en el chat o en Mis productos, es el de la sesión. Cambiar de conversación o crear una nueva no lo cambia.
12. Al abrir un chat existente, el selector muestra el cliente que guardó el back para ese chat, no el que recuerda el navegador. Si el back no lo tiene, cae al valor que guardó el navegador y, si tampoco hay, al de la sesión.
13. Abrir un chat existente de otro cliente no cambia el cliente de la sesión: la barra y el saludo del chat nuevo siguen con el elegido.

## 2. Decisions

- Los tres filtros usan el motivo del handoff y no `chat.useCase`. Según docs/flujo-atencion.md, a la Bandeja solo llegan esos tres motivos; las intenciones del clasificador (Consultas generales, Comercial, Pidió un asesor…) no son filas de la Bandeja.
- El motivo sale de la conversación en curso (la última sin `closedAt`), no del historial del cliente, porque el asesor atiende lo que el cliente pide ahora (precisión del usuario). Evaluarlo lo hace el back; el front solo manda el parámetro y muestra lo que devuelve.
- El contador se ve también en 0 (antes se ocultaba), porque el usuario quiere ver de un vistazo que no hay casos de un motivo.
- "Con asesor" muestra todas las conversaciones en `human_agent`, no solo las propias. Así las vistas calzan con los cuatro estados del flujo (Con AI, En espera, Con asesor, Resuelta). Quién la atiende se sigue viendo en la fila ("Con asesor · tú" o "Con asesor · ada").
- La Bandeja se agrupa por motivo del handoff, con "Otros" para las que no tienen, porque las secciones tienen que coincidir con los filtros. Hoy agrupa por caso de uso y quedaría incoherente.
- El cliente de la sesión es el último elegido en un selector. Se guarda en `localStorage` (`demo-customer:last`), así que sobrevive a recargas, igual que hoy. Deja de actualizarse al abrir un chat, porque abrir un chat no es elegir un cliente. Esa es la causa del bug: el cliente de cada chat salía de `localStorage` y, si el chat no estaba ahí, caía al valor por defecto.
- Un chat existente toma su cliente del back, porque es el dato verdadero. El que guarda el navegador por chat queda solo como respaldo para chats de antes de este cambio.
- Supuesto de contrato, pendiente de confirmación de w1:p1:
  - La lista acepta `handoffReason=<complaint|retention|case_status>`, aplicado a la conversación en curso de cada cliente (la última sin `closedAt`).
  - `counts?groupBy=customer` agrega `byHandoffReason: { complaint, retention, case_status }` (clientes por el motivo de su conversación en curso) y `withAdvisor` (clientes con su conversación más reciente en `human_agent`).
  - `GET /api/chat/:id` agrega `demoCustomerToken: string | null`: el token del cliente demo cuyo customerId guardó el chat.
  - Si los nombres cambian, se ajusta solo `src/lib/advisor.ts` y `ChatPage`.
- Queda fuera de esta fase filtrar por intención del clasificador dentro de Con AI: David las atiende solo y no es trabajo del asesor.

## 3. Context

- `spec/roadmap.md`: nueva Phase 21, "Filtros por motivo y cliente demo fijo".
- `docs/flujo-atencion.md` §5 (estados) y etapa 5 (motivos de derivación).
- Existing patterns:
  - `src/lib/advisor.ts` (`InboxView`, `viewUrl`, `parseCounts`, `countFor`, `groupByUseCase`);
  - `src/lib/handoff-case.ts` (`handoffReasonLabel`);
  - `src/components/conversations/inbox-views.tsx`;
  - `src/lib/demo-customer-storage.ts` (`setActiveCustomerToken`, `getLastCustomerToken`);
  - `src/components/chat.tsx:78-98` (token del chat);
  - `src/pages/ChatPage.tsx` (datos iniciales del chat).
