# Validation: Conversaciones de todos los usuarios para admin

La fase está lista para mergear cuando se cumple todo lo que sigue.

## Automated Tests

- [ ] `npm run test:ephemeral` termina en 0, sin fallos
- [ ] `npm run test:with-db` termina en 0 con una base de datos configurada
- [ ] `npm run lint` termina sin errores y sin reescribir archivos
- [ ] `npx tsc --noEmit` y `npm run build:server` sin errores
- [ ] `npm run db:check` sin inconsistencias en las migraciones

### Specific test coverage required

#### Unit

- [ ] `isAdminEmail` acepta un email de la lista aunque tenga espacios o
      mayúsculas
- [ ] `isAdminEmail` rechaza un email fuera de la lista, una lista vacía y un
      email vacío

#### Integration

- [ ] `GET /api/admin/chats` como admin trae chats de dos usuarios, cada uno
      con su `userEmail`
- [ ] `GET /api/admin/chats?userId=` filtra por ese usuario
- [ ] `GET /api/admin/users` incluye a los dos usuarios
- [ ] `GET /api/admin/chats/:id/messages` como admin lee el chat privado de
      otro usuario
- [ ] `GET /api/history` sigue sin devolver chats de otro usuario

#### End-to-end

- [ ] Un usuario que no es admin recibe 403 en las tres rutas
- [ ] Un chat inexistente en `/api/admin/chats/:id/messages` → 404
- [ ] Sin base de datos, las tres rutas → 204

## Manual Checks

Con el backend local, base de datos configurada y `ADMIN_EMAILS` con tu email:

- [ ] Crear un chat → en la base, `Chat.userEmail` tiene tu email
- [ ] `curl /api/admin/chats` → aparece el chat con `userEmail`; los chats
      anteriores a la migración aparecen con `userEmail: null`
- [ ] `curl /api/admin/users` → apareces en la lista
- [ ] Sacar tu email de `ADMIN_EMAILS` y reiniciar → las tres rutas dan 403
- [ ] `npm run db:migrate` sobre una base existente agrega la columna sin
      perder datos

## Definition of Done

Todas las casillas marcadas, la migración commiteada junto al schema y el
contrato de las tres rutas enviado al front.
