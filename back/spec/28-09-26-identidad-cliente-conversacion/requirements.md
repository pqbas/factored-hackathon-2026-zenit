# Requirements: Identidad del cliente y conversación continua

Con esta fase, cada mensaje que el backend manda al agente lleva el token de
sesión del cliente, y la UI puede pedir la lista de clientes demo para que el
usuario elija uno. La otra mitad de la fase ya está hecha: el backend manda el
id del chat como `context.conversation_id` y el agente lo usa como `thread_id`
(`agent/src/main.py:57-66`). Esta fase no la cambia; solo agrega un test que la
cubre del lado del agente. El contrato con la UI (`POST /api/chat`) solo gana un
campo opcional, y el modelo de datos no cambia.

## 1. Functional requirements

Después de esta fase, el sistema debe seguir haciendo lo que hace hoy:

1. Todos los turnos de un chat llegan al agente con el mismo
   `context.conversation_id`, igual al id del chat.
2. Un `POST /api/chat` sin token de sesión sigue funcionando y el agente
   responde lo que corresponda (pedir que inicie sesión).
3. El chat funciona igual con base de datos y en modo efímero.

Y cambia en estas cosas:

4. `POST /api/chat` acepta un campo opcional `sessionToken` en el body. Si
   viene, el request al agente lleva `custom_inputs.session_token` con ese
   valor.
5. El token viaja solo en la llamada al agente. La llamada que genera el
   título del chat no lo recibe.
6. Si `sessionToken` no es un string de 1 a 256 caracteres, `POST /api/chat`
   responde 400 y no llama al agente.
7. `GET /api/demo-customers` devuelve la lista de clientes demo (`token`,
   `label`) para que la UI muestre un selector. Exige usuario autenticado.
8. Si el token es inválido o venció, el backend pasa al chat la respuesta del
   agente tal cual, sin inventar su propio mensaje.

## 2. Decisions

- El backend reenvía el token sin validarlo, porque el nodo `gate` del agente
  es el único que resuelve `session_token → customer_id`
  (`agent/docs/01-identidad-de-usuario.md`). Si el backend también lo validara,
  habría dos fuentes de verdad que podrían contradecirse.
- La UI manda el token en cada mensaje y el backend no lo guarda, porque es lo
  que pide el doc de identidad y porque guardar tokens en la tabla `Chat`
  convierte a la base en otro lugar con credenciales.
- El token viaja del chat al provider con un header interno
  (`x-databricks-session-token`) que `databricksFetch` retira antes de llamar
  al endpoint. Es el mismo patrón que ya usan `conversation_id` y `user_id`
  (`providers-server.ts:133-160`), y deja la llamada del título sin token.
- `thread_id` no se agrega a `custom_inputs`, porque el agente ya lee
  `context.conversation_id` cuando falta `thread_id`. Mandar los dos sería
  duplicar el mismo dato.
- La lista de clientes demo sale de la variable de entorno
  `DEMO_CUSTOMERS_JSON`. Si no está definida, se usan los tokens que el agente
  trae de fábrica en `agent/src/db/session_repo.py` (`demo-mx-1`, `demo-co-1`,
  `demo-ar-1`, `demo-closed`, `demo-expired`). Así, cuando cambian los tokens
  del agente, se ajusta la configuración sin tocar código.
  <!-- Supuesto: la lista vive en el backend y no en ../front. Confirmar. -->
- El selector de cliente en `../front` queda fuera de esta fase, porque esta
  fase entrega el contrato del backend. La UI lo consume en su propio repo.
- El login real y la tabla Customer Sessions quedan fuera, porque todavía no
  están definidos del lado del banco (pendiente en `agent/README.md`). Cuando
  existan, solo cambia de dónde saca la UI el token, no este contrato.

## 3. Context

- `spec/roadmap.md`: Phase 1, Identidad del cliente y conversación continua.
- `agent/docs/01-identidad-de-usuario.md`: el token viaja en
  `custom_inputs.session_token`, separado del texto.
- `agent/src/main.py:57-66` y `:122`: cómo el agente lee `thread_id` y la
  sesión.
- `agent/src/db/session_repo.py`: los tokens demo de fábrica.
- Patrones existentes:
  - `packages/ai-sdk-providers/src/providers-server.ts`: `databricksFetch`
    retira headers internos e inyecta datos en el body.
  - `packages/core/src/schemas/chat.ts`: esquema Zod del body de
    `POST /api/chat`.
  - `server/src/routes/config.ts`: forma de un router simple de solo lectura.
  - `tests/routes/context-injection.test.ts` y
    `tests/api-mocking/api-mock-handlers.ts`: captura del body que llega al
    endpoint mockeado.
