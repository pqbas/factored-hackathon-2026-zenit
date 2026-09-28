# Validation: Identidad del cliente y conversación continua

La fase está lista para mergear cuando se cumple todo lo que sigue.

## Automated Tests

- [x] `npm test` termina en 0, sin fallos
- [x] `npm run lint` termina sin errores de Biome
- [x] `npm run build:server` compila sin errores de tipos

### Specific test coverage required

#### Unit

- [x] `databricksFetch` con el header de token agrega
      `custom_inputs.session_token` y quita el header
- [x] `databricksFetch` sin el header no agrega `custom_inputs`
- [x] `databricksFetch` conserva los `custom_inputs` que ya venían en el body
- [x] `getDemoCustomers` devuelve los de por defecto sin variable, el JSON
      cuando es válido y los de por defecto cuando es inválido

#### Integration

- [x] `POST /api/chat` con `sessionToken` llega al endpoint con
      `custom_inputs.session_token` y `context.conversation_id` igual al id del
      chat
- [x] `POST /api/chat` sin `sessionToken` llega sin `custom_inputs`
- [x] La llamada que genera el título no lleva `custom_inputs`
- [x] Dos turnos del mismo chat llegan con el mismo `conversation_id`

#### End-to-end

- [x] `GET /api/demo-customers` autenticado responde 200 con la lista
- [x] `GET /api/demo-customers` usa `requireAuth` (revisión de código: el harness no puede producir un 401)
- [x] `POST /api/chat` con `sessionToken` vacío responde 400

## Manual Checks

Con `DATABRICKS_SERVING_ENDPOINT` o `API_PROXY` apuntando al agente de
`../agent` (local con `uv run start-app` o desplegado):

- [x] `curl` a `GET /api/demo-customers` → aparecen los cinco clientes demo
- [x] `POST /api/chat` con `sessionToken: "demo-mx-1"` preguntando por el saldo
      → el agente responde con datos de Santiago (México, USD)
- [x] Segundo mensaje en el mismo chat que depende del anterior ("¿y el
      límite?") → el agente lo entiende sin repetir contexto
- [x] `POST /api/chat` con `sessionToken: "demo-expired"` → el chat muestra la
      respuesta del agente pidiendo iniciar sesión
- [ ] `POST /api/chat` sin `sessionToken` → la misma respuesta de iniciar
      sesión. Depende del agente: hoy usa `DEMO_SESSION_TOKEN` como fallback y
      responde con los datos de Santiago. El fix está en
      `fix/pqbas-agent-no-default-session` (904e5b0); el backend ya manda el
      request sin `custom_inputs`.
- [x] En el log del servidor (`Databricks request:`) el request al agente trae
      `custom_inputs.session_token` y el de `title-model` no. En la prueba
      manual el request de `title-model` no apareció en el log; lo cubre el
      test de integración.

## Definition of Done

Todas las casillas marcadas, sin `console.log` de depuración nuevos, y el agente
real responde con los datos del cliente del token en un chat de varios turnos.
