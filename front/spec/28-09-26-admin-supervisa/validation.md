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

Con el back de `main` (PR #27) en local, `chatbot_dev`,
`ADMIN_EMAILS=pcubasm1@gmail.com` y `ADVISOR_EMAILS=asesor1,asesor2`:

- [x] El admin ve el riel sin Admin, arranca en Todas (19 conversaciones),
      filtra por usuario (solo las de ese dueño) y abre una en solo lectura sin
      controles ni composer; la API le responde 403 en take, messages y
      release; `/admin` lleva a `/conversations`.
- [x] asesor1 arranca en Abiertas, sin filtro de usuario; toma una
      conversación de David, responde ("Tú") sin botón de force, el admin la ve
      como "La atiende asesor1@example.com", y la devuelve a David.

## Definition of Done
Todo marcado y la Fase 5b del back en `main`.
