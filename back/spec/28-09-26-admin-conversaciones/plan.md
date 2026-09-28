# Plan: Conversaciones de todos los usuarios para admin

## Code changes

| Module                                   | Origin               | Change                                                          |
| ---------------------------------------- | -------------------- | --------------------------------------------------------------- |
| `packages/db/src/schema.ts`              | —                    | Modified: columna `userEmail` en `Chat`.                        |
| `packages/db/migrations/0002_*.sql`      | —                    | New: generada con `npm run db:generate`.                        |
| `packages/db/src/queries.ts`             | `getChatsByUserId`   | Modified: `saveChat` guarda `userEmail`; `getChats` con `userId` opcional; nueva `getChatOwners`. |
| `server/src/routes/chat.ts`              | —                    | Modified: pasa `userEmail` a `saveChat`.                        |
| `server/src/routes/history.ts`           | —                    | Modified: llama a `getChats({ userId })`.                       |
| `server/src/middleware/auth.ts`          | —                    | Modified: nuevo `requireAdmin`.                                 |
| `server/src/routes/admin.ts`             | —                    | New: `/api/admin/chats`, `/users`, `/chats/:id/messages`.       |
| `server/src/index.ts`                    | —                    | Modified: registra `adminRouter`.                               |
| `.env.example`, `playwright.config.ts`   | —                    | Modified: `ADMIN_EMAILS`.                                       |

---

## Group 1: Base de datos

1. En `packages/db/src/schema.ts`, agregar a `chat`:
   `userEmail: varchar('userEmail', { length: 256 })` (nullable).

2. Correr `npm run db:generate` y revisar que la migración nueva en
   `packages/db/migrations/` sea solo
   `ALTER TABLE "ai_chatbot"."Chat" ADD COLUMN "userEmail" varchar(256);`.
   Commitear el SQL y `meta/`.

3. En `packages/db/src/queries.ts`:
   - `saveChat`: aceptar `userEmail?: string | null` y guardarlo.
   - Renombrar `getChatsByUserId` a `getChats` y volver opcional `id`
     (renombrarlo a `userId?: string`). La condición `eq(chat.userId, ...)` se
     agrega solo si viene. Agregar el filtro `userId` y actualizar los textos de
     los `console.log` y del error.
   - Nueva `getChatOwners()`: `selectDistinct({ userId: chat.userId,
     userEmail: chat.userEmail }).from(chat).orderBy(asc(chat.userEmail))`.
     Sin base de datos devuelve `[]`, igual que las demás.

---

## Group 2: Rutas

4. En `server/src/routes/chat.ts:132`, pasar `userEmail: session.user.email`
   a `saveChat`.

5. En `server/src/routes/history.ts`, cambiar el import y la llamada a
   `getChats({ userId: session.user.id, ... })`.

6. En `server/src/middleware/auth.ts`, agregar `requireAdmin` después de
   `requireAuth`:
   - Lee `process.env.ADMIN_EMAILS` en cada request (así los tests pueden
     cambiarla), hace split por `,`, trim y lowercase, y descarta vacíos.
   - Sin sesión → 401 con `unauthorized:chat`. Email fuera de la lista →
     403 con `ChatSDKError('forbidden:chat')`.

7. Crear `server/src/routes/admin.ts` siguiendo `history.ts`:
   - `adminRouter.use(authMiddleware)` y `[requireAuth, requireAdmin]` en
     cada ruta.
   - `GET /chats`: el mismo parseo de params que `history.ts` más
     `userId`; 204 sin base de datos; llama a `getChats`.
   - `GET /users`: 204 sin base de datos; `{ users: await getChatOwners() }`.
   - `GET /chats/:id/messages`: 204 sin base de datos; `getChatById` y 404
     con `ChatSDKError('not_found:chat')` si no existe; si existe,
     `getMessagesByChatId`.

8. En `server/src/index.ts`, registrar `app.use('/api/admin', adminRouter)`.

9. En `.env.example`, documentar `ADMIN_EMAILS` (lista separada por comas;
   vacía = nadie es admin).

---

## Group 3: Tests

El proyecto usa los proyectos de Playwright `unit` (`tests/ai-sdk-provider/`)
y `routes` (`tests/routes/`, servidor real con MSW). No hay tests de navegador
en `back/`.

10. En `playwright.config.ts`, agregar a `webServer.env`
    `ADMIN_EMAILS` con `ada-0@example.com` … `ada-7@example.com` (uno por
    worker). `babbage-*` queda como no admin.

11. Unit, en `tests/ai-sdk-provider/admin-emails.test.ts`: extraer el
    parseo de `ADMIN_EMAILS` a una función pura `isAdminEmail(email, raw)` en
    `server/src/admin.ts` y testearla:
    - Email en la lista, con espacios y con mayúsculas → true.
    - Email fuera de la lista → false.
    - Lista vacía o no definida → false.
    - Email vacío o undefined → false.

12. Integration, en `tests/routes/admin.test.ts` (con `skipInEphemeralMode`):
    - Ada crea un chat y Babbage crea otro. `GET /api/admin/chats` como Ada
      trae los dos, cada uno con su `userEmail`.
    - `?userId=` de Babbage trae solo el chat de Babbage.
    - `GET /api/admin/users` incluye a los dos.
    - `GET /api/admin/chats/:id/messages` como Ada sobre el chat privado de
      Babbage → 200 con sus mensajes.
    - `GET /api/history` como Ada sigue sin traer el chat de Babbage.

13. End-to-end, en el mismo archivo:
    - Babbage (no admin) en las tres rutas → 403.
    - `GET /api/admin/chats/<uuid inexistente>/messages` como Ada → 404.
    - En modo efímero (con `skipInWithDatabaseMode`), las tres rutas → 204.
