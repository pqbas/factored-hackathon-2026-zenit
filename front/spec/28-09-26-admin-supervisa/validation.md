# Validation: El admin supervisa desde Chats

## Automated Tests
- [x] `npm run build` y `npm test` en `front/`.
- [x] E2E completo con `FRONT_URL=http://localhost:3100` en `back/`.
- [x] Sin referencias a `/api/admin/` en `front/src`.

### Specific test coverage required
#### Unit
- [x] `inboxUrl` con `all` (sin `status`) y con `userId`.
- [x] La matriz no tiene sección admin y Chats es de advisor y admin.
#### Integration
- [x] `take` manda `{}` (sin `force`).
#### End-to-end
- [x] El admin no tiene "Admin" en el riel y `/admin` lleva a Chats.
- [x] El admin filtra por usuario (`userId`) y por Todas.
- [x] El admin abre una conversación sin interruptor, Tomar, Resolver ni
      campo, y con "Supervisión: solo lectura".
- [x] El asesor sigue tomando y respondiendo, sin "Tomar de todos modos".

## Manual Checks

Pendiente hasta que la Fase 5b del back esté en `main`; la vista se revisó con
la API mockeada en el navegador.
- [ ] Con el back de la Fase 5b: el admin ve la bandeja completa, filtra por
      usuario y lee; un asesor atiende normal.

## Definition of Done
Todo marcado y la Fase 5b del back en `main`.
