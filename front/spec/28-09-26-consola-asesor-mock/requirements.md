# Requirements: Consola del asesor estilo CRM, con datos mock

La vista Chats (`/conversations`) pasa de ser un visor estilo WhatsApp a una
consola donde el asesor atiende las conversaciones que el asistente le deriva:
prende o apaga el asistente, ve el estado y el tema de cada conversación, recibe
imágenes con datos sensibles ocultos y responde con atajos. Todo sigue siendo
mock en el front: no hay llamadas nuevas al back ni al agente. La referencia
visual es el artboard "E · Consola del asesor (chats)" del lienzo
https://claude.ai/artifact/SfN8i51oncvvSj5dskfiH9.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. `/conversations` lista cinco clientes, se busca por nombre sin importar
   mayúsculas ni tildes y ordena por el último mensaje.
2. Abrir un cliente quita su contador de no leídos, resalta la fila y muestra
   las burbujas con hora y separadores por día.
3. Lo que se escribe queda solo en pantalla y desaparece al recargar.
4. El riel cambia entre Mis productos, Agente y Chats.

And it changes in these ways:

5. El encabezado de la conversación muestra el nombre completo, el ID de
   cliente, el teléfono enmascarado (`+54 9 11 •••• 4821`) y el canal.
6. Un interruptor "Asistente ON/OFF" por conversación: en OFF el asesor atiende
   y puede escribir; en ON un aviso dice que el asistente responde y el campo de
   texto queda deshabilitado.
7. Cada conversación tiene un estado: Con asistente, Sin atender, En atención o
   Resuelto. Se ve como chip en la fila de la lista y en el encabezado.
8. Arriba de la lista hay filtros: Todos, Sin atender (con el conteo) y En
   atención.
9. Apagar el asistente en una conversación Con asistente la pasa a En
   atención. En una Sin atender el asistente ya está apagado: el primer mensaje
   del asesor la pasa a En atención. El botón "Resolver" la pasa a Resuelto y
   vuelve a prender el asistente.
10. Cada conversación muestra etiquetas: el tema (Transferencia, Límite,
    Bloqueo, Beneficiarios…) y el producto relacionado. "+ Etiqueta" agrega una
    etiqueta libre que queda solo en pantalla.
11. Los mensajes pueden traer una imagen. Si la imagen tuvo datos ocultos, la
    burbuja lo dice ("Ocultamos un código de seguridad").
12. Cuando el asistente deriva, el chat muestra un aviso centrado con el
    motivo y la hora ("El asistente derivó a un asesor · reclamo de
    transferencia · 10:42").
13. Los mensajes del asistente y del asesor se distinguen: los dos van a la
    derecha en celeste, con el remitente arriba ("Asistente" o "Tú").
14. Encima del campo de texto hay respuestas rápidas; tocar una la pone en el
    campo. Hay un botón para adjuntar una imagen (se ve solo en pantalla) y otro
    para respuestas rápidas.
15. Si el asesor sube en el chat, aparece un botón flotante para bajar al último
    mensaje.

## 2. Decisions

- Los datos mock siguen el modelo de handoff del agente (`handled_by`,
  `status`, `reason`, mensajes `system`, en `agent/docs/07-handoff.md`), porque
  así la Fase 7 cambia la fuente de datos sin rehacer la pantalla.
- Los estados de la UI salen de ese modelo: Con asistente = `handled_by:
  ai_agent`; Sin atender = `human_queue` (`pending`); En atención =
  `human_agent` (`assigned`); Resuelto = `closed`. Se usan nombres en español
  porque la UI está en español.
- El interruptor muestra ON solo con `handled_by: ai_agent`, porque en
  `human_queue` el agente ya no responde (el `gate` lo deja pasivo). Apagarlo o
  escribir en una Sin atender equivale a tomar el caso (`claim`); "Resolver"
  equivale a cerrarlo con `returned_to_agent`, el único cierre que no necesita
  elegir resultado.
- El resultado del cierre ("Venta" en la captura; aquí sería producto
  contratado o reclamo abierto) no entra, porque depende de `outcome` y `note`
  de la API real; llega en la Fase 7.
- Ocultar datos sensibles en las imágenes es trabajo del back o del agente, no
  del front. El mock trae la imagen ya tapada y una lista `redactions` que la
  burbuja muestra, porque el front nunca debe recibir el dato completo.
- El teléfono se guarda completo en el mock y se enmascara en la UI con un
  helper, así el enmascarado queda probado aunque la fuente cambie.
- No hay selector de emojis, porque no va con el tono de un banco.
- Adjuntar solo acepta imágenes y las muestra con `URL.createObjectURL`, sin
  subirlas a ningún lado, porque la fase es mock.
- Las respuestas rápidas son una lista fija en el mock, porque todavía no hay
  dónde guardarlas.
- Los cambios de estado viven en un reducer puro en `lib/conversations.ts`, así
  se prueban sin montar componentes.
- Chats sigue visible para todos los usuarios, porque los roles llegan en la
  Fase 5.
- Todo el estilo es con utilidades de Tailwind v4 y los tokens de `index.css`:
  sin `style={{}}` ni clases CSS propias.

## 3. Context

- `spec/roadmap.md`: Phase 4, Consola del asesor estilo CRM, con datos mock.
- `agent/docs/07-handoff.md`: estados, `handled_by`, mensajes `system` y API
  `/handoffs` que la Fase 7 va a usar.
- `agent/docs/06-politica-de-derivacion.md`: motivos (`reason`) de derivación.
- Existing patterns: `src/pages/ConversationsPage.tsx` (estado local sobre una
  copia del mock), `src/components/conversations/*` (lista y vista),
  `src/components/products/product-list.tsx` (chips y filas del Sidebar),
  `src/lib/conversations.ts` (helpers puros).
