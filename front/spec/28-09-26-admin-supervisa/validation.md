# Validation: El admin supervisa desde Chats

## Automated Tests
- [ ] `npm run build` y `npm test` en `front/`.
- [ ] E2E completo con `FRONT_URL=http://localhost:3100` en `back/`.
- [ ] Sin referencias a `/api/admin/` en `front/src`.

### Specific test coverage required
#### Unit
- [ ] `inboxUrl` con `all` (sin `status`) y con `userId`.
- [ ] La matriz no tiene sección admin y Chats es de advisor y admin.
#### Integration
- [ ] `take` manda `{}` (sin `force`).
#### End-to-end
- [ ] El admin no tiene "Admin" en el riel y `/admin` lleva a Chats.
- [ ] El admin filtra por usuario (`userId`) y por Todas.
- [ ] El admin abre una conversación sin interruptor, Tomar, Resolver ni
      campo, y con "Supervisión: solo lectura".
- [ ] El asesor sigue tomando y respondiendo, sin "Tomar de todos modos".

## Manual Checks
- [ ] Con el back de la Fase 5b: el admin ve la bandeja completa, filtra por
      usuario y lee; un asesor atiende normal.

## Definition of Done
Todo marcado y la Fase 5b del back en `main`.
