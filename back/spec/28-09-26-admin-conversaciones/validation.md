# Validation: Conversaciones de todos los usuarios para admin

La fase está lista para mergear cuando se cumple todo lo que sigue.

## Automated Tests

- [x] `npm run test:ephemeral` termina en 0, sin fallos
- [x] `npm run test:with-db` termina en 0 con una base de datos configurada
- [x] `npm run lint` termina sin errores y sin reescribir archivos
- [x] `npx tsc --noEmit` y `npm run build:server` sin errores
- [x] `npm run db:check` sin inconsistencias en las migraciones

### Specific test coverage required

#### Unit

- [x] `isEmailInList` acepta un email de la lista aunque tenga espacios o
      mayúsculas
- [x] `isEmailInList` rechaza un email fuera de la lista, una lista vacía y un
      email vacío

- [x] `getRole` da admin si el email está en las dos listas, advisor si solo
      está en `ADVISOR_EMAILS` y customer en cualquier otro caso

#### Integration

- [x] `GET /api/admin/chats` como admin trae chats de dos usuarios, cada uno
      con su `userEmail`
- [x] `GET /api/admin/chats?userId=` filtra por ese usuario
- [x] `GET /api/admin/users` incluye a los dos usuarios
- [x] `GET /api/admin/chats/:id/messages` como admin lee el chat privado de
      otro usuario
- [x] `GET /api/history` sigue sin devolver chats de otro usuario

#### End-to-end

- [x] `GET /api/session` devuelve `role: 'admin'` para un admin y
      `role: 'customer'` para un usuario que no está en ninguna lista

- [x] Un usuario que no es admin recibe 403 en las tres rutas
- [x] Un chat inexistente en `/api/admin/chats/:id/messages` → 404
- [x] Sin base de datos, las tres rutas → 204

## Manual Checks

Con el backend local, base de datos configurada y `ADMIN_EMAILS` con tu email:

- [x] Crear un chat → en la base, `Chat.userEmail` tiene tu email
- [x] `curl /api/admin/chats` → aparece el chat con `userEmail`; los chats
      anteriores a la migración aparecen con `userEmail: null`
- [x] `curl /api/admin/users` → apareces en la lista
- [x] Sacar tu email de `ADMIN_EMAILS` y reiniciar → las tres rutas dan 403
- [x] `npm run db:migrate` sobre una base existente agrega la columna sin
      perder datos

## Definition of Done

Todas las casillas marcadas, la migración commiteada junto al schema y el
contrato de las tres rutas enviado al front.
