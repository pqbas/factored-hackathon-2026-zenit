# Requirements: Bandeja o Agente AI dentro de cada motivo

En las vistas de Motivo de derivación (Reclamo, Cancelación de producto y Estado de un reclamo), el asesor puede elegir entre dos listas con un selector segmentado arriba:

- Bandeja: los chats ya derivados con ese motivo, como hoy.
- Agente AI: los chats de ese mismo caso que David atiende todavía, sin derivar. Por ejemplo, un reclamo a mitad de la recolección.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. Entrar a un motivo desde el sidebar abre la opción Bandeja, que muestra lo mismo que hoy: los chats en espera y con asesor derivados con ese motivo.
2. Los contadores del sidebar siguen contando la Bandeja.
3. Las demás vistas no cambian.

And it changes in these ways:

4. Arriba de la lista de un motivo hay un selector segmentado con dos opciones, "Bandeja" y "Agente AI". Cada una muestra su contador.
5. "Agente AI" lista los chats abiertos que atiende David (`handledBy=ai_agent`) cuyo caso de uso es el del motivo:
   - Reclamo: COMPLAINT;
   - Cancelación de producto: RETENTION;
   - Estado de un reclamo: CASE_STATUS.

   La lista va plana, sin secciones, porque todos los chats son del mismo caso.
6. La elección se guarda en la URL (`?reason=complaint&scope=david`). Al recargar o compartir el link, se abre el mismo motivo con la misma opción. Sin `scope`, se abre Bandeja.
7. Si "Agente AI" no tiene chats, dice "David no atiende ningún caso de este motivo ahora."

## 2. Decisions

- La lista usa filtros que el back ya tiene: `handledBy=ai_agent&useCase=<USE_CASE>` sobre la conversación en curso de cada cliente. El back solo guarda como caso GENERAL_INQUIRY, COMPLAINT, CASE_STATUS o RETENTION, así que Cancelación de producto se filtra solo por RETENTION.
- El contador de "Agente AI" sale de un campo nuevo de counts: `aiAgentByUseCase`, que se le pidió a w1:p1. Si el back todavía no lo manda, la opción se muestra sin contador en lugar de mostrar un 0 falso.
- Solo los motivos guardan su vista en la URL. Hoy ninguna vista lo hace, y llevarlas todas a la URL es otro cambio. Al elegir otra vista del sidebar, esos parámetros se borran.
- Cambiar de opción cierra el chat abierto, igual que cambiar de vista.
- El selector sigue el estilo del resto de la consola (Notion Mail): un fondo gris claro y la opción activa en blanco con una sombra leve, sin bordes marcados.

## 3. Context

- Roadmap: Phase 25.
- Código existente:
  - `src/lib/advisor.ts`: `InboxView`, `viewUrl`, `parseCounts` y `countFor`;
  - `src/pages/ConversationsPage.tsx`: `view` y `openView`;
  - `src/components/conversations/inbox-list.tsx`: el encabezado de la lista.
- Back: `getCustomerInbox`, que ya filtra por `useCase`, y `getConversationCounts`, que ya calcula `aiAgent` por fila de `useCase`.
