# Validation: Consola del asesor con toma manual

La fase está lista para mergear cuando se cumple todo lo que sigue.

## Automated Tests

- [x] `npm run test:ephemeral` y `npm run test:with-db` (base nueva) en 0,
      también con `--repeat-each 3 --retries 0`
- [x] `npm run lint`, `npx tsc --noEmit`, `npm run build:server`,
      `npm run db:check`
- [x] `cd front && npm run build` contra la rama

### Specific test coverage required

#### Unit

- [x] El historial para el agente excluye system y blocked, y antepone
      `[Asesor] ` solo a los mensajes del asesor
- [x] La carrera: una respuesta que termina con el chat fuera de `ai_agent` no
      se guarda

#### Integration

- [x] take / take idempotente / 409 con `assignedTo` / force de admin / 403
      con force de advisor
- [x] messages solo del que la tomó (201); el resto 409, incluido admin
- [x] release de quien la tiene, de admin sobre ajena, y 409 de advisor sobre
      ajena
- [x] `closedAt` con `resolved` y vuelta a null cuando escribe el cliente
- [x] El request al agente después de un turno del asesor lleva
      `'[Asesor] ...'` y no lleva los system

#### End-to-end

- [x] customer → 403 en `/api/advisor/*`
- [x] El cliente recibe el mensaje del asesor por
      `GET /api/messages/:id?after=`; `after` de otro chat → 400
- [x] Bandeja: filtros `assignedTo=me`, `status` y `handledBy`

## Manual Checks

Con el back del puerto 3200 (`ADVISOR_EMAILS`/`ADMIN_EMAILS` configurados) y el
agente real:

- [x] Un chat con el agente, tomarlo con curl → el siguiente mensaje del
      cliente no llama al agente (log)
- [x] Responder como asesor → el cliente lo ve con `?after=`
- [x] Devolver al agente → el agente responde el siguiente mensaje y su
      request trae `[Asesor] ...`

## Definition of Done

Todas las casillas marcadas, el contrato de §1 enviado al front, y la
migración aplicada a `chatbot_dev` después del merge.
