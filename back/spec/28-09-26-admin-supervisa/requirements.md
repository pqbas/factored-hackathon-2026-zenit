# Requirements: El admin supervisa, no atiende

Decisión del usuario: en la consola, el admin **solo supervisa**. Lee todas las
conversaciones, pero no las toma, no responde y no las devuelve. Solo los
asesores atienden. Además, todo queda bajo `/api/advisor/*` y se borra
`/api/admin/*`, que el front deja de usar.

## 1. Contrato (cambios sobre la Fase 5)

| Ruta | Advisor | Admin | Customer |
| --- | --- | --- | --- |
| `GET /api/advisor/conversations` | 200 | 200 | 403 |
| `GET /api/advisor/conversations/:id/messages` | 200 | 200 | 403 |
| `GET /api/advisor/users` (nueva) | 403 | 200 | 403 |
| `POST /api/advisor/conversations/:id/take` | 200 / 409 | **403** | 403 |
| `POST /api/advisor/conversations/:id/messages` | 201 / 409 | **403** | 403 |
| `POST /api/advisor/conversations/:id/release` | 200 / 409 | **403** | 403 |
| `/api/admin/*` | — | **404 (eliminada)** | — |

- **Bandeja.** Sin cambios de forma. Lista todas las conversaciones (las de
  David, las de la cola, las tomadas y las cerradas) con los filtros
  `handledBy`, `assignedTo`, `status`, `useCase`, `userId` y la paginación.
  Reemplaza a `GET /api/admin/chats`, con la misma respuesta
  `{ chats, hasMore }`: cada chat trae `userEmail`, `assignedTo`, etc.
- **`GET /api/advisor/users`**, solo admin → `{ users: [{ userId, userEmail
  }] }`, una fila por usuario con al menos un chat. Es lo que era
  `GET /api/admin/users`, para el filtro por cliente.
- **Mensajes de un chat.** `GET /api/advisor/conversations/:id/messages`
  reemplaza a `GET /api/admin/chats/:id/messages`.
- **take.** Se elimina `force`: el body es `{}`. Si llega `force`, se ignora.
  Un asesor sobre una conversación que tiene otro asesor recibe
  `409 { code: 'conflict:chat', assignedTo }`, como antes.
- **release.** Solo quien la tiene tomada; cualquier otro, 409 (el admin, 403).
- Mensajes system: se va "Otro asesor continúa la conversación." (era de
  `force`); quedan "Te atiende un asesor.", "Volviste con David." y "La
  conversación se cerró.".
- Errores de permiso: `403 { code: 'forbidden:chat' }`.

## 2. Fuera de alcance / futuro

- Conversación tomada y abandonada: sin `force`, si un asesor toma una
  conversación y se va, nadie la puede liberar. Una salida (rescate por otro
  asesor con motivo e inactividad, o un timeout) es lógica de negocio de un
  cliente real y no se implementa en la hackathon (criterio del usuario,
  28-09-26).

## 3. Functional requirements

1. Lo de §1.
2. Un asesor sigue pudiendo hacer todo lo de la Fase 5, salvo `force`.
3. El admin lee la bandeja, los mensajes y la lista de usuarios, y recibe 403
   al escribir.
4. `/api/admin/*` responde 404.

## 4. Decisions

- Una sola API de lectura para advisor y admin (`/api/advisor/*`), para no
  tener dos rutas que hacen lo mismo. El front ya migra a esta.
- La lista de usuarios queda solo para admin, porque es para supervisar.
- `force` se elimina en vez de pasar a asesores, para que la regla "dos
  personas nunca responden el mismo chat" no tenga excepciones. Las
  conversaciones abandonadas quedan fuera de alcance (§2).
- `requireAdmin` queda solo para `/api/advisor/users`.

## 5. Context

- `spec/roadmap.md`: matriz de acceso (Phase 2) y Phase 5b.
- Código: `server/src/routes/advisor.ts`, `server/src/routes/admin.ts`
  (se borra), `server/src/middleware/auth.ts`,
  `tests/routes/advisor.test.ts`, `tests/routes/admin.test.ts`.
