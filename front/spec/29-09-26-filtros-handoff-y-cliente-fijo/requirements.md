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
10a. El motivo y el contexto de la fila van al estilo Notion Mail, como asunto más vista previa en la misma línea:
    - El asunto es el motivo en texto normal, con peso medio y el color de texto principal, precedido de un puntito del color del motivo (sin fondo de chip).
    - La vista previa va a continuación, en gris y sin negrita: el resumen del handoff recortado a 60 caracteres como máximo en palabra completa y terminado en "...". El resumen completo va como tooltip y en el panel Contexto.
    - Aplica a toda conversación derivada, esté En espera o Con asesor. Si el handoff no trae resumen, la fila muestra solo el asunto y nunca el último mensaje.
    - En Agente AI el asunto es el caso que David atiende (sección por caso de uso) y la vista previa es el último mensaje del cliente.
    - Una conversación humana sin handoff no muestra motivo de derivación: ni asunto ni chip, solo su último mensaje. Tampoco el encabezado.
    Vale en la lista ancha y en la angosta.
10i. Al abrir una conversación, el chat se abre como panel flotante sobre la lista, al estilo del side peek de Notion. La lista no cambia: sigue ancha, con todas sus columnas, debajo.
    - El panel flota anclado a la derecha, con sombra y borde redondeado.
    - Su borde izquierdo cae justo después de la columna del nombre, que tiene ancho fijo. Así los nombres siguen visibles y un click en otra fila cambia de chat.
    - Dentro va lo mismo de antes: encabezado, mensajes, input y panel Contexto.
    - Se cierra con la X, con Esc o con un click fuera de las filas.
    - Si el panel Contexto está abierto y la pantalla mide menos de 1600 px, el panel empieza más a la izquierda y tapa la lista, porque no hay lugar para chat y contexto.
    Reemplaza a la lista angosta (cambio de enfoque del usuario).
10j. En el panel flotante cada dato aparece una sola vez (pedido del usuario):
    - Nombre: va solo en el encabezado del chat. La segunda línea del encabezado lleva solo el chip del motivo: ni email ni "Cliente •• XXXX" (decisión final del usuario). Quién es el cliente se ve en "Datos del cliente" del panel Contexto.
    - Motivo: va solo en el chip del encabezado. Sale de la tarjeta "Caso derivado por David".
    - Estado y quién atiende: van solo en la zona del input, en una sola línea, y salen del encabezado. El encabezado queda con nombre, email, "Cliente •• XXXX" y el chip del motivo. El placeholder dice:
      - tomada por otro: "La atiende asesor1 (asesor1@example.com)", con ícono de persona;
      - tomada por ti: el placeholder normal para escribir;
      - en espera: "En espera · tómala para responder";
      - con David: "La atiende David";
      - resuelta: "Resuelta".
      Sale también la línea extra debajo de los mensajes (candado, "Esperando a un asesor…", "Estás atendiendo…", "David está respondiendo…").
    - El separador de la conversación activa deja solo la fecha: su motivo y su estado ya están en el encabezado. Las conversaciones anteriores conservan los suyos.
10b. La vista de las conversaciones que atiende David (`handledBy=ai_agent`) pasa a llamarse "Agente AI", en el item del sidebar y en el título de la vista. El estado de la fila ("Con AI", uno de los cuatro estados del flujo) no cambia (pedido del usuario).
10c. La tarjeta "Caso derivado por David" (resumen y ficha de datos verificados) sale de arriba del chat y pasa al panel "Contexto del cliente", como primera sección, arriba de las pestañas Casos, Interacciones y Transcripciones. El chat queda solo con los mensajes. El chip del motivo en el encabezado se queda. Si la conversación abierta tiene handoff, el panel Contexto se abre por defecto (pedido del usuario).
10d. El separador de cada conversación en la línea de tiempo muestra el motivo del handoff si esa conversación se derivó, y ningún chip si no. Nunca muestra la intención del clasificador (revisión de w1:p4).
10e. En la lista angosta (con un chat abierto), todas las filas muestran su estado, también "Con asesor" (revisión de w1:p4).
10f. En las filas de la consola, cuando un asesor tomó la conversación (`human_agent`), la columna del medio (la del robot de David, entre el nombre y la etiqueta de detalle) muestra un badge con ícono de persona y el usuario del asesor (la parte del email antes de la @, o "tú" si es quien mira). El estado de la derecha queda solo "Con asesor". En espera no lleva nada en esa columna. Vale para la lista ancha y la angosta; el encabezado de la conversación sigue diciendo quién la atiende (pedido del usuario).
10g. La vista "Agente AI" también se separa en secciones, con el mismo estilo de chips que la Bandeja. Como ahí no hay handoff, las secciones salen del `useCase` de la conversación en curso:
    - Reclamo: COMPLAINT.
    - Cancelación de producto: RETENTION y CANCEL.
    - Estado de un reclamo: CASE_STATUS.
    - Consultas generales: GENERAL_INQUIRY.
    - Otros, al final: saludo, despedida, fuera de alcance y sin `useCase`.
    No hay filtros nuevos en el sidebar (pedido del usuario).
    Cada fila de Agente AI muestra en la columna del medio un badge con el robot y "David", con el mismo estilo que el del asesor en la Bandeja.
10h. Cada motivo tiene un solo nombre en todas partes, el de los filtros: Reclamo, Cancelación de producto, Estado de un reclamo. Rige para filtros, secciones, chip del encabezado, tarjeta "Caso derivado por David", separadores de conversación y panel de métricas (donde RETENTION y CANCEL se suman en "Cancelación de producto"). El segundo nivel es solo el detalle: el tipo de reclamo (No reconoce el cargo, Cobro duplicado, Monto distinto al esperado) o el producto (Tarjeta Crédito ••6262), con el mismo texto en la fila y en la tarjeta. El chip del encabezado muestra el motivo del handoff si la conversación se derivó; si no, la sección de Agente AI que corresponda al caso de uso, y nada para "Otros" (pedido del usuario).
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
