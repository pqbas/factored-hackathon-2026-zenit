# Plan: El admin supervisa desde Chats

Rama: `feat/pqbas-front-phase8-admin-supervisa`, desde `main`.

1. `src/lib/roles.ts`: sin sección `admin`; `chats` para advisor y admin.
2. `src/App.tsx`: `/admin` → `<Navigate to="/conversations" replace />`.
   `src/components/nav-rail.tsx`: sin la entrada Admin.
3. Borrar `src/pages/AdminPage.tsx`, `src/components/admin/`,
   `src/lib/admin.ts`, `tests/unit/admin.test.ts`,
   `back/tests/e2e/admin.test.ts`.
4. `src/lib/advisor.ts`: filtro `all`, `userId` en `inboxUrl`, filtros por
   rol, `fetchUsers`; `takeConversation` sin `force`.
5. Lista: filtros por rol y, para el admin, menú de usuario.
6. Encabezado y vista: modo `readOnly` (sin controles ni composer, con aviso);
   el asesor sin force.
7. Tests: unit (`advisor`, `roles`), integration (`advisor-api` sin force),
   e2e (`conversations` con admin supervisor, `roles` con la matriz nueva).
