# Requirements: Consola del asesor con toma manual

Con esta fase, un asesor o admin puede tomar una conversación desde la consola,
responderle al cliente y después devolverla al asistente o cerrarla. El cliente
ve los mensajes del asesor en su chat por polling. No depende del agente: la
toma es manual y el handoff automático llega en la Fase 6. Regla del usuario:
**dos personas nunca responden el mismo chat.**

## 1. Contrato

Todas las rutas `/api/advisor/*` llevan `requireAuth` + `requireAdvisor`, que
acepta `advisor` o `admin` (401 sin sesión, 403 con otro rol). La identidad
sale de `X-Forwarded-Email`, nunca del body. Sin base de datos responden 204.

### 1.1 Datos

- `Chat` gana `assignedTo: string | null` (email de quien la tomó),
  `assignedAt: string | null` y `closedAt: string | null`. `handledBy` sigue
  diciendo solo quién atiende (`ai_agent | human_queue | human_agent`);
  "cerrada" es `closedAt`, no un valor de `handledBy`.
- `Message` gana `senderType: 'customer' | 'ai_agent' | 'human_agent' |
  'system' | null` y `senderId: string | null`.
  - Cliente: `role 'user'`, `senderType 'customer'`.
  - Agente: `role 'assistant'`, `senderType 'ai_agent'`.
  - Asesor: `role 'assistant'`, `senderType 'human_agent'`,
    `senderId` = su email.
  - Aviso de corte: `role 'system'`, `senderType 'system'`.
  - Los mensajes anteriores a esta fase quedan con `senderType: null`: el
    front los interpreta por `role`.

### 1.2 Rutas

| Método y ruta | Body | Respuesta | Errores |
| --- | --- | --- | --- |
| `GET /api/advisor/conversations` | — | `{ chats: Chat[], hasMore }` | — |
| `GET /api/advisor/conversations/:id/messages?after=<id>` | — | `Message[]` | 404 chat, 400 `after` inválido |
| `POST /api/advisor/conversations/:id/take` | `{ force?: boolean }` | `200 { chat }` | 404, 409, 403 (`force` sin ser admin) |
| `POST /api/advisor/conversations/:id/messages` | `{ text }` (1 a 4000 caracteres) | `201 { message }` | 404, 409, 400 |
| `POST /api/advisor/conversations/:id/release` | `{ outcome: 'returned_to_agent' \| 'resolved', note? }` | `200 { chat }` | 404, 409, 400 |

- **Bandeja.** Query: `handledBy`, `assignedTo` (`me` o un email), `status`
  (`open` = `closedAt` nulo, `closed`), `useCase`, `userId`, `limit`,
  `starting_after`, `ending_before`. Mismo orden y paginación que
  `/api/history`.
- **take.** Pone `handledBy='human_agent'`, `assignedTo`=yo, `assignedAt`=now,
  `closedAt`=null, y guarda un mensaje system. Es un UPDATE condicional:
  - Libre (`handledBy ≠ human_agent`) o ya mía → 200. Tomarla de nuevo si ya
    es mía es idempotente y no repite el mensaje system.
  - De otro asesor → `409 { code: 'conflict:chat', assignedTo }`.
  - De otro asesor con `{ force: true }` → solo admin; la reasigna al admin y
    guarda un mensaje system. Un advisor con `force` recibe 403.
- **messages.** Solo si `handledBy='human_agent'` y `assignedTo`=yo. Vale
  también para admin: un admin que quiere responder primero hace take con
  `force`. Si no, 409.
- **release.** Pone `handledBy='ai_agent'`, `assignedTo=null` y
  `assignedAt=null`, y guarda un mensaje system. Con `outcome 'resolved'` pone
  además `closedAt=now`. Lo puede hacer quien la tiene tomada o un admin. Un
  advisor sobre una conversación ajena, o una conversación que no está tomada,
  recibe 409.
- **Mensajes nuevos (cliente y consola).** `GET /api/messages/:id?after=<id>`
  (cliente, con `requireChatAccess`) y la ruta de la consola aceptan `after`
  = id del último mensaje que se tiene. Devuelven los posteriores, ordenados
  por `(createdAt, id)`. Sin `after` devuelven todos. Si `after` no existe o
  es de otro chat, responden 400. Cada mensaje trae `senderType` y
  `senderId`.
- `GET /api/chat/:id` y `/api/history` devuelven el Chat con `handledBy`,
  `assignedTo`, `assignedAt` y `closedAt`.
- Textos de los mensajes system, visibles para el cliente y sin el email del
  asesor: take → "Te atiende un asesor."; take con force → "Otro asesor
  continúa la conversación."; release `returned_to_agent` → "Volviste con el
  asistente."; release `resolved` → "La conversación se cerró.".

### 1.3 Historial que va al agente

- Se excluyen los mensajes `system` y los `blocked`.
- Los de `senderType 'human_agent'` van con `role 'assistant'` y el texto con
  el prefijo fijo `'[Asesor] '`. El prefijo se agrega solo en el request al
  agente: no se guarda en la base ni lo ve el front. Lo definió el agente.

## 2. Functional requirements

Después de esta fase, el sistema debe seguir haciendo lo que hace hoy:

1. Un chat que atiende el agente funciona igual.
2. Si `handledBy ≠ ai_agent`, el mensaje del cliente se guarda sin llamar al
   agente, con el stream `start` + `data-conversation-state` + `finish`.
3. `/api/admin/*` sigue con `requireAdmin`.

Y cambia en estas cosas:

4. Todo lo del contrato §1.
5. Cuando el cliente escribe en una conversación cerrada, `closedAt` vuelve a
   `null`.
6. Carrera: si al terminar un turno del agente el chat ya no está en
   `ai_agent` (lo tomó un asesor mientras respondía), la respuesta no se guarda
   como mensaje del agente ni se aplican sus `custom_outputs`.

## 3. Decisions

- Acciones explícitas (`take`, `release`) en lugar de un PATCH genérico de
  `handledBy`, para que cada transición se valide y deje un mensaje system.
- Un solo que responde por chat, incluido admin: el admin primero toma con
  `force`. Así nunca hay dos personas respondiendo el mismo chat.
- "Cerrada" es `closedAt` y no un valor de `handledBy`, para que `handledBy`
  siga diciendo solo quién atiende. Cerrar devuelve la conversación al agente.
- Polling con cursor por id en lugar de timestamp, para no perder ni repetir
  mensajes con el mismo `createdAt`. SSE queda para después, sin cambiar las
  rutas.
- Los mensajes del asesor viven en `Message`, así el cliente tiene una sola
  fuente.
- En la carrera, la respuesta del agente se descarta: la conversación ya es del
  asesor y un turno del agente después del aviso de toma confundiría al
  cliente.
- La tabla de casos, la prioridad y el resumen del handoff automático quedan
  para la Fase 6. `assignedTo` y los mensajes system no cambian cuando llegue.

## 4. Context

- `spec/roadmap.md`: Phase 5.
- Matriz de roles: `spec/roadmap.md`, Phase 2 (requireAdvisor = advisor o
  admin).
- Patrones existentes: `server/src/routes/admin.ts` (router con permisos),
  `server/src/middleware/auth.ts` (`requireAdmin`), `server/src/roles.ts`
  (`getRole`), `packages/db/src/queries.ts` (`getChats`, `chatScopeCondition`,
  `updateChatAgentState`), `server/src/routes/chat.ts` (historial al agente,
  `onFinish`, stream sin agente).
