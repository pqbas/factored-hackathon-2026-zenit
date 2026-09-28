# Requirements: El admin supervisa desde Chats

Admin y Chats se unen en una sola pantalla. El asesor sigue atendiendo como
hoy; el admin ve todas las conversaciones y las lee sin poder actuar. Consume
el contrato de la Fase 5b del back (`back/spec/28-09-26-admin-supervisa/`):

- `GET /api/advisor/conversations` y `.../:id/messages`: advisor y admin
  (200); la bandeja lista todo, con filtros `handledBy`, `assignedTo`,
  `status`, `useCase`, `userId` y paginación.
- `GET /api/advisor/users` (solo admin) → `{ users: [{ userId, userEmail }] }`.
- `take` / `messages` / `release`: solo advisor; el admin recibe 403. No hay
  `force`. Entre asesores sigue el 409.
- `/api/admin/*` desaparece.

## 1. Functional requirements

Sigue igual:

1. El asesor usa la bandeja, toma, responde, devuelve y resuelve como hoy.
2. El cliente no cambia.

Cambia:

3. Matriz: customer = asistente + Mis productos; advisor = asistente + Chats;
   admin = asistente + Mis productos + Chats. No hay sección Admin.
4. `/admin` redirige a `/conversations`.
5. El asesor ya no ve "Tomar de todos modos".
6. El admin en Chats:
   - filtros Todas, Abiertas, Sin atender, Con David y Cerradas, y un filtro
     por usuario (`userId`) con la lista de `/api/advisor/users`;
   - abre cualquier conversación en solo lectura: sin interruptor de David,
     sin Tomar ni Resolver, sin campo para escribir, con el aviso
     "Supervisión: solo lectura".

## 2. Decisions

- Se borra la vista Admin de la Fase 6 (página, componentes y `lib/admin.ts`),
  porque su trabajo lo hace ahora Chats para el admin.
- El admin entra por defecto al filtro Todas, porque supervisa todo; el
  asesor sigue en Abiertas.
- La UI oculta las acciones al admin, pero es el back quien las prohíbe (403).
- No se mergea antes que el back: la rama borra el uso de `/api/admin/*` y el
  back lo borra en el mismo corte.

## 3. Context

- `spec/roadmap.md`: Phase 8.
- Existing patterns: `src/pages/ConversationsPage.tsx`, `src/lib/advisor.ts`,
  `src/lib/roles.ts`, la lista de usuarios de la vista admin de la Fase 6.
