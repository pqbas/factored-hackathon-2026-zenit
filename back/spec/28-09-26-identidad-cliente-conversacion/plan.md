# Plan: Identidad del cliente y conversación continua

## Code changes

| Module                                              | Origin | Change                                                                  |
| --------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| `packages/core/src/schemas/chat.ts`                 | —      | Modified: campo opcional `sessionToken`.                                |
| `packages/ai-sdk-providers/src/providers-server.ts` | —      | Modified: header `CONTEXT_HEADER_SESSION_TOKEN` e inyección en `custom_inputs`. |
| `server/src/routes/chat.ts`                         | —      | Modified: pasa el token como header en `streamText`.                    |
| `server/src/demo-customers.ts`                      | —      | New: lista de clientes demo desde `DEMO_CUSTOMERS_JSON` o por defecto.  |
| `server/src/routes/demo-customers.ts`               | —      | New: `GET /api/demo-customers`.                                         |
| `server/src/index.ts`                               | —      | Modified: registra el router nuevo.                                     |
| `.env.example`                                      | —      | Modified: documenta `DEMO_CUSTOMERS_JSON`.                              |
| `tests/api-mocking/api-mock-handlers.ts`            | —      | Modified: captura `custom_inputs`.                                      |

---

## Group 1: Token hasta el agente

1. En `packages/core/src/schemas/chat.ts`, agregar a `postRequestBodySchema`:
   - `sessionToken: z.string().min(1).max(256).optional()`.

2. En `packages/ai-sdk-providers/src/providers-server.ts`:
   - Exportar `CONTEXT_HEADER_SESSION_TOKEN = 'x-databricks-session-token'`
     junto a los otros dos headers (línea 16).
   - En `databricksFetch`, leer y borrar ese header junto a los otros
     (líneas 135-139).
   - Si hay token, body string y `shouldInjectContext()` es true, agregar
     `custom_inputs: { ...body.custom_inputs, session_token: token }`. Esta
     inyección no depende de que existan `conversationId` y `userId`: separarla
     del bloque actual de `context` (líneas 143-160) sin cambiar ese bloque.
   - Verificar que `CONTEXT_HEADER_SESSION_TOKEN` se reexporte desde
     `@chat-template/core` como los otros headers (seguir la cadena de
     `packages/core/src/ai/providers.ts:9-11`).

3. En `server/src/routes/chat.ts`:
   - Desestructurar `sessionToken` de `requestBody` (línea 97).
   - En `streamText` (línea 233), agregar
     `...(sessionToken ? { [CONTEXT_HEADER_SESSION_TOKEN]: sessionToken } : {})`
     a `headers`.
   - No tocar `generateTitleFromUserMessage`: sin header, sin token.

---

## Group 2: Clientes demo

4. Crear `server/src/demo-customers.ts`:
   - Tipo `DemoCustomer = { token: string; label: string }`.
   - `DEFAULT_DEMO_CUSTOMERS` con los cinco tokens de
     `agent/src/db/session_repo.py` y etiquetas legibles ("Santiago · México",
     "Javier · Colombia", "Daniela · Argentina", "Cliente cerrado",
     "Sesión vencida").
   - `getDemoCustomers()`: parsea `process.env.DEMO_CUSTOMERS_JSON` con un
     esquema Zod (array de `{ token, label }`). Si falta, devuelve los de por
     defecto. Si el JSON es inválido, loguea el error y devuelve los de por
     defecto.

5. Crear `server/src/routes/demo-customers.ts` siguiendo
   `server/src/routes/config.ts`:
   - `demoCustomersRouter.use(authMiddleware)`.
   - `GET /` con `requireAuth` → `res.json({ customers: getDemoCustomers() })`.

6. En `server/src/index.ts`, registrar
   `app.use('/api/demo-customers', demoCustomersRouter)` junto a las otras
   rutas (línea 54-59).

7. En `.env.example`, documentar `DEMO_CUSTOMERS_JSON` con un ejemplo de una
   línea y aclarar que los tokens tienen que existir en el agente.

---

## Group 3: Tests

El proyecto usa los proyectos de Playwright `unit`, `routes` y `e2e`
(`playwright.config.ts`), no carpetas `tests/unit/` o `tests/integration/`. Los
tests siguen esa convención.

8. En `tests/api-mocking/api-mock-handlers.ts`, agregar `customInputs` a
   `CapturedRequest` y guardarlo en `captureRequestContext` a partir de
   `body.custom_inputs`.

9. Unit, en `tests/ai-sdk-provider/` (proyecto `unit`): `databricksFetch` con
   un `fetch` falso.
   - Con header de token, el body sale con `custom_inputs.session_token` y el
     header no sale.
   - Sin header, el body sale sin `custom_inputs`.
   - Si el body ya trae otros `custom_inputs`, se conservan.
   - `getDemoCustomers()`: sin variable devuelve los de por defecto; con JSON
     válido devuelve ese; con JSON inválido devuelve los de por defecto.

10. Integration, en `tests/routes/context-injection.test.ts` (proyecto
    `routes`, servidor real con el endpoint mockeado por MSW):
    - `POST /api/chat` con `sessionToken` → el request capturado trae
      `custom_inputs.session_token` y `context.conversation_id` igual al id
      del chat.
    - Sin `sessionToken` → el request capturado no trae `custom_inputs`.
    - La llamada del título no trae `custom_inputs`.
    - Dos turnos del mismo chat → mismo `conversation_id` y el mismo token en
      los dos.

11. End-to-end, en `tests/routes/demo-customers.test.ts` y
    `tests/routes/chat.test.ts` (entrada HTTP real; la UI vive en `../front`,
    así que aquí no hay test de navegador):
    - `GET /api/demo-customers` autenticado → 200 con la lista.
    - Sin usuario → 401: no se testea porque con `PLAYWRIGHT=True` la auth siempre inyecta un usuario de prueba (`packages/auth/src/databricks-auth.ts`). Lo cubre `requireAuth`.
    - `POST /api/chat` con `sessionToken: ''` → 400.
