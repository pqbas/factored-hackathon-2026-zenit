# Requirements: Idioma ES | PT en el chat del cliente

La pantalla del chat, que el cliente usa y que asesores y admins abren como Simulador de cliente, gana un selector de idioma visible, "ES | PT". Todos sus textos se muestran en español o en portugués. El idioma elegido viaja con cada mensaje para que David responda en ese idioma cuando el mensaje no deja claro cuál usar.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. Todo sigue en español mientras nadie elija portugués y el cliente o el navegador no digan otra cosa.
2. La consola del asesor, las métricas y Mis productos siguen en español.

And it changes in these ways:

3. El header del chat tiene un selector segmentado "ES | PT" junto al selector de cliente demo.
4. Con PT, la pantalla del chat se muestra en portugués:
   - el saludo ("Bom dia, Santiago") y la presentación de David;
   - las 4 tarjetas de opciones: título, descripción y el mensaje que envían;
   - el placeholder y el aviso del CVV;
   - el header: estados ("Assistente virtual · Online", "Aguardando um atendente"…), "Nova conversa" y "Sem salvar";
   - el selector de cliente demo;
   - el aviso de derivación y el de David no disponible;
   - la barra de conversaciones: título, vacío, grupos por fecha y diálogo de borrar.
5. La elección se guarda en el navegador (`localStorage`, clave `ui:lang`) y vale para todos los chats.
6. Sin una elección guardada, el idioma por defecto sale:
   1. del país del cliente demo activo (Brasil → PT, los demás → ES);
   2. si no hay cliente demo, del idioma del navegador (`pt*` → PT);
   3. si no, ES.
7. Cada mensaje al back lleva `language: 'es' | 'pt'` en el body de `POST /api/chat`. El back lo pasa al agente como `custom_inputs.language` y el agente lo usa cuando el mensaje es ambiguo. Esa parte es de w1:p1 y w1:p3.

## 2. Decisions

- Un diccionario propio (`src/lib/i18n.ts`) y un contexto (`useLang`), sin librería. Son dos idiomas y unas 60 cadenas; una librería de i18n no aporta nada a este tamaño.
- Solo la pantalla del chat. La consola del asesor y las métricas son herramientas internas en español, como pidió w1:p4. Mis productos queda para después, igual que los textos del back (mensajes de sistema) y los de las respuestas de David.
- El país del cliente demo se lee de su etiqueta ("Santiago · México"), porque la lista de clientes demo no trae otro campo de país.
- Las tarjetas envían el mensaje en el idioma elegido. Así el clasificador de David ya ve portugués aunque el back todavía no mande el idioma.
- El selector de idioma no se bloquea con el primer mensaje, a diferencia del cliente demo: cambiar de idioma a mitad de chat es válido.

## 3. Context

- Pedido de w1:p4 (30/09). Contrato propuesto a w1:p1 y w1:p3: `language` en el body → `custom_inputs.language`.
- Textos:
  - `greeting.tsx`, `suggested-actions.tsx`, `multimodal-input.tsx`;
  - `chat-header.tsx`, `demo-customer-selector.tsx`, `agent-unavailable.tsx`;
  - `lib/handoff.ts` (`handoffNotice`), `lib/assistant.ts`;
  - `app-sidebar.tsx`, `sidebar-history.tsx`, `message.tsx` (la etiqueta "Asesor").
