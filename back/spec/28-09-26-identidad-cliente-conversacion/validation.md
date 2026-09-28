# Validation: Identidad del cliente y conversación continua

La fase está lista para mergear cuando se cumple todo lo que sigue.

## Automated Tests

- [ ] `npm test` termina en 0, sin fallos
- [ ] `npm run lint` termina sin errores de Biome
- [ ] `npm run build:server` compila sin errores de tipos

### Specific test coverage required

#### Unit

- [ ] `databricksFetch` con el header de token agrega
      `custom_inputs.session_token` y quita el header
- [ ] `databricksFetch` sin el header no agrega `custom_inputs`
- [ ] `databricksFetch` conserva los `custom_inputs` que ya venían en el body
- [ ] `getDemoCustomers` devuelve los de por defecto sin variable, el JSON
      cuando es válido y los de por defecto cuando es inválido

#### Integration

- [ ] `POST /api/chat` con `sessionToken` llega al endpoint con
      `custom_inputs.session_token` y `context.conversation_id` igual al id del
      chat
- [ ] `POST /api/chat` sin `sessionToken` llega sin `custom_inputs`
- [ ] La llamada que genera el título no lleva `custom_inputs`
- [ ] Dos turnos del mismo chat llegan con el mismo `conversation_id`

#### End-to-end

- [ ] `GET /api/demo-customers` autenticado responde 200 con la lista
- [ ] `GET /api/demo-customers` usa `requireAuth` (revisión de código: el harness no puede producir un 401)
- [ ] `POST /api/chat` con `sessionToken` vacío responde 400

## Manual Checks

Con `DATABRICKS_SERVING_ENDPOINT` o `API_PROXY` apuntando al agente de
`../agent` (local con `uv run start-app` o desplegado):

- [ ] `curl` a `GET /api/demo-customers` → aparecen los cinco clientes demo
- [ ] `POST /api/chat` con `sessionToken: "demo-mx-1"` preguntando por el saldo
      → el agente responde con datos de Santiago (México, USD)
- [ ] Segundo mensaje en el mismo chat que depende del anterior ("¿y el
      límite?") → el agente lo entiende sin repetir contexto
- [ ] `POST /api/chat` con `sessionToken: "demo-expired"` → el chat muestra la
      respuesta del agente pidiendo iniciar sesión
- [ ] `POST /api/chat` sin `sessionToken` → la misma respuesta de iniciar
      sesión
- [ ] En el log del servidor (`Databricks request:`) el request al agente trae
      `custom_inputs.session_token` y el de `title-model` no

## Definition of Done

Todas las casillas marcadas, sin `console.log` de depuración nuevos, y el agente
real responde con los datos del cliente del token en un chat de varios turnos.
