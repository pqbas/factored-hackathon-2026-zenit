# Requirements: Selector de cliente demo

Con esta fase, el usuario elige con qué cliente demo habla antes de empezar un
chat, y cada mensaje de ese chat llega al backend con el token de ese cliente.
La fase consume el contrato que agrega la Fase 1 del back
(`back/spec/28-09-26-identidad-cliente-conversacion/`):
`GET /api/demo-customers` → `{ customers: [{ token, label }] }` y el campo
opcional `sessionToken` en el body de `POST /api/chat`. No cambia ese contrato
ni el resto del body de `POST /api/chat`.

## 1. Functional requirements

Después de esta fase, la UI debe seguir haciendo lo que hace hoy:

1. El chat funciona igual con base de datos y en modo efímero: streaming,
   reanudación del stream, historial en la barra lateral.
2. Si `GET /api/demo-customers` falla o devuelve una lista vacía, el chat se
   puede usar igual y los mensajes salen sin `sessionToken`.

Y cambia en estas cosas:

3. En un chat nuevo, el encabezado muestra un selector con los clientes de
   `GET /api/demo-customers`, identificados por su `label`.
4. Por defecto, el selector muestra el último cliente que el usuario eligió.
   Si nunca eligió uno, muestra el primero de la lista.
5. Cada `POST /api/chat` de un chat lleva `sessionToken` con el token del
   cliente de ese chat.
6. Al enviar el primer mensaje, el cliente queda asociado al chat. Desde ahí
   el selector muestra el cliente pero no deja cambiarlo.
7. Al volver a abrir un chat desde la barra lateral, los mensajes nuevos salen
   con el mismo token que tenían antes.
8. Si el token es inválido o venció (`demo-expired`, `demo-closed`), el chat
   muestra la respuesta del agente tal cual, sin mensaje propio de la UI.

## 2. Decisions

- El cliente se fija por chat y no se puede cambiar a mitad de conversación,
  porque el agente usa el id del chat como `thread_id`. Cambiar de cliente en
  el mismo hilo mezclaría la memoria de dos clientes.
- La asociación chat → token se guarda en `localStorage` del navegador, porque
  el back no guarda el token a propósito (así la base no se vuelve otro lugar
  con credenciales). Un chat abierto en otro navegador o con el storage
  borrado no tiene token guardado. En ese caso el selector vuelve a quedar
  habilitado, y el cliente se fija con el siguiente mensaje.
- Todo acceso a `localStorage` va en `try/catch` y, si falla, la app sigue sin
  recordar la elección, porque hay navegadores que bloquean el storage.
- El selector va en el encabezado del chat (`ChatHeader`), en la columna
  derecha junto a los indicadores del chat (sin guardar, id), porque queda
  visible durante toda la conversación y el centro ya muestra "Asistente · En
  línea".
- El token viaja en el body de `POST /api/chat` como `sessionToken`; el back lo
  pasa al agente como `custom_inputs.session_token`. Sin cliente elegido no se
  manda el campo, porque un string vacío da 400 en el back.
- La UI no valida el token ni interpreta la respuesta de "inicia sesión",
  porque el nodo `gate` del agente es la única fuente de verdad sobre la
  sesión (`agent/docs/01-identidad-de-usuario.md`).
- Los tests de navegador van en `back/tests/e2e/`, porque ahí está Playwright
  con el servidor real que sirve `front/dist`. El e2e mockea
  `GET /api/demo-customers` con `page.route` y revisa el body de
  `POST /api/chat` desde el navegador, así prueba el contrato del front sin
  depender de que la Fase 1 del back esté en `main`; el reenvío al agente ya lo
  prueban los tests del back.
- Hasta que el back esté en `main`, `npm run dev` responde
  `GET /api/demo-customers` con un mock de Vite (solo en dev), para poder
  probar el selector contra el back de `main`.
- El PR se abre recién cuando la Fase 1 del back esté en `main`, porque sin
  ella el schema de `POST /api/chat` descarta `sessionToken` y el token no
  llega al agente. Después va el fix del agente que quita el cliente por
  defecto (`fix/pqbas-agent-no-default-session`).
- El login real queda fuera de esta fase, porque todavía no está definido del
  lado del banco. Cuando exista, cambia de dónde sale el token, no cómo viaja.
- Los roles (cliente, asesor, admin) quedan fuera; llegan en la Fase 5.

## 3. Context

- `spec/roadmap.md`: Phase 1b, Selector de cliente demo en el chat.
- `back/spec/28-09-26-identidad-cliente-conversacion/requirements.md`: el
  contrato de `GET /api/demo-customers` y de `sessionToken`.
- `agent/docs/01-identidad-de-usuario.md`: el token viaja separado del texto.
- `agent/src/db/session_repo.py`: los tokens demo (`demo-mx-1`, `demo-co-1`,
  `demo-ar-1`, `demo-closed`, `demo-expired`).
- Patrones existentes:
  - `src/contexts/AppConfigContext.tsx`: lectura de un endpoint de solo
    lectura con SWR y `fetcher`.
  - `src/components/chat.tsx`: `prepareSendMessagesRequest` arma el body de
    `POST /api/chat`, y `streamCursorRef` es un ejemplo de ref leída desde el
    transport.
  - `src/pages/NewChatPage.tsx`: preferencia guardada en `localStorage`
    (`chat-model`).
  - `src/components/ui/dropdown-menu.tsx`: componente base del selector.
  - `back/tests/e2e/`, `back/tests/pages/chat.ts` y
    `back/tests/api-mocking/api-mock-handlers.ts`: tests de navegador y
    captura del request que llega al endpoint.
