# Validation: El admin supervisa, no atiende

- [x] `npm run lint`, `npx tsc --noEmit`, `npm run build:server`
- [x] `test:with-db` (base nueva) con `--repeat-each 3 --retries 0` y
      `test:ephemeral`, en 0
- [x] `cd front && npm run build` contra la rama
- [x] Admin: 200 en la bandeja, los mensajes y `/users`; 403 en take, messages
      y release
- [x] Advisor: 403 en `/users`; take, messages y release como en la Fase 5
- [x] `force` ignorado; 409 entre dos asesores; toma concurrente, uno gana
- [x] `/api/admin/*` → 404
- [x] Manual en :3200 con cabeceras: `asesor1` toma y responde; el admin
      (pcubasm1) ve la conversación en la bandeja y recibe 403 al tomarla

Definition of Done: todo marcado, y el contrato de §1 enviado al front.
