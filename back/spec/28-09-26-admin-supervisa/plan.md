# Plan: El admin supervisa, no atiende

1. `server/src/middleware/auth.ts`: agregar `requireAdvisorOnly` (403 si
   `getRole` no es `advisor`).
2. `server/src/routes/advisor.ts`: `requireAdvisorOnly` en take, messages y
   release; quitar `force` del esquema y de la lógica de take, junto con su
   mensaje system. Agregar `GET /users` con `requireAdmin`, que llama a
   `getChatOwners`.
3. `packages/db/src/queries.ts`: quitar `force` de `takeChat` (la condición
   queda `handledBy <> 'human_agent' OR assignedTo = yo`).
4. Borrar `server/src/routes/admin.ts` y su `app.use` en `server/src/index.ts`.
   `requireAdmin` queda para `/users`.
5. Tests:
   - `playwright.config.ts`: sumar `asesor2@example.com` a `ADVISOR_EMAILS`
     para tener un segundo asesor por cabeceras (curie tiene que seguir sin
     chats).
   - `tests/routes/advisor.test.ts`: ada (admin) → 200 en bandeja y mensajes,
     403 en take/messages/release; `/users` → 200 admin, 403 advisor; el 409 y
     la toma concurrente ahora entre babbage y asesor2; quitar los tests de
     `force`.
   - `tests/routes/admin.test.ts`: pasar lo que sigue vigente (userEmail,
     filtro userId, usuarios sin duplicados, chat ajeno) a la bandeja de la
     consola y borrar el archivo; `/api/admin/chats` → 404.
