# Requirements: Conversaciones de todos los usuarios para admin

Con esta fase, un operador puede revisar las conversaciones de cualquier usuario
desde la pantalla de admin del front (Fase 6 del front). El backend agrega tres
rutas de solo lectura bajo `/api/admin` y empieza a guardar el email del dueño
en cada conversación. Las rutas de usuario (`/api/history`, `/api/messages`) no
cambian de contrato.

## 1. Functional requirements

Después de esta fase, el sistema debe seguir haciendo lo que hace hoy:

1. `GET /api/history` devuelve solo las conversaciones del usuario logueado,
   con los mismos params y la misma respuesta.
2. `GET /api/messages/:id` sigue negando los chats privados de otro usuario.
3. En modo efímero (sin base de datos) el chat funciona igual.

Y cambia en estas cosas:

4. Cada conversación nueva guarda el email del usuario que la creó.
5. `GET /api/admin/chats` devuelve las conversaciones de todos los usuarios,
   con los mismos params que `/api/history` (`limit`, `starting_after`,
   `ending_before`, `status`, `intent`, `customer`) más `userId` opcional.
   Responde `{ chats, hasMore }`, y cada chat trae `userEmail`, que es `null`
   en los chats creados antes de esta fase.
6. `GET /api/admin/users` devuelve `{ users: [{ userId, userEmail }] }`: los
   usuarios que tienen al menos una conversación, ordenados por email.
7. `GET /api/admin/chats/:id/messages` devuelve los mensajes de cualquier chat,
   sea privado o de otro usuario. Si el chat no existe, responde 404.
8. Las tres rutas responden 403 si el email de la sesión no está en
   `ADMIN_EMAILS`, y 401 si no hay sesión.
9. Sin base de datos, las tres rutas responden 204, igual que `/api/history`.

## 2. Decisions

- El email del dueño va en una columna nueva `Chat.userEmail`, y no en la tabla
  `User` con un join. La tabla `User` nunca se escribe hoy, y una columna en
  `Chat` resuelve la lista y el filtro con una sola query, sin un paso extra de
  upsert de usuario en cada chat.
- Los chats viejos quedan con `userEmail = null` y no se rellenan, porque el
  email nunca se guardó en ningún lado y no hay de dónde sacarlo.
- `getChatsByUserId` pasa a llamarse `getChats`, con `userId` opcional, y
  `/api/history` la llama con el usuario de la sesión. Así las dos rutas
  comparten filtros y paginación sin duplicar la query. `/api/history` tiene
  que pasar siempre `userId`, y un test lo cubre.
- Admin es un email de la lista `ADMIN_EMAILS` (separada por comas, sin
  distinguir mayúsculas) comparado contra `session.user.email`. Ese email sale
  de `X-Forwarded-Email`, que inyecta Databricks Apps. La sesión no tiene roles
  y un grupo de Databricks exigiría llamar a SCIM, así que eso queda para más
  adelante, detrás del mismo middleware `requireAdmin`.
- Si `ADMIN_EMAILS` está vacía o no está definida, nadie es admin. Es el
  default seguro: un despliegue sin configurar no expone conversaciones ajenas.
- Los filtros `status`, `intent` y `customer` se mantienen por paridad con
  `/api/history`, aunque hoy lleguen vacíos. Se reemplazan en la Fase 3 (estado
  del agente), no en esta.
- Las rutas son de solo lectura. Borrar o editar conversaciones ajenas no lo
  pidió nadie.

## 3. Context

- `spec/roadmap.md`: Phase 2, Conversaciones de todos los usuarios para admin.
- Pedido del front (Fase 6 del front): el email del dueño en cada chat y la
  lista de usuarios para el filtro.
- Patrones existentes:
  - `server/src/routes/history.ts`: parseo de params, 204 sin base de datos.
  - `server/src/routes/messages.ts`: lectura de mensajes por chat.
  - `server/src/middleware/auth.ts`: forma de `requireAuth` y
    `requireChatAccess` para `requireAdmin`.
  - `packages/db/src/queries.ts:145-275`: `getChatsByUserId` (filtros y
    paginación por cursor).
  - `packages/db/migrations/0001_old_gladiator.sql`: migración que agrega
    columnas a `Chat`.
  - `tests/routes/history.test.ts`: tests con `skipInEphemeralMode` y los
    fixtures `adaContext` y `babbageContext`.
