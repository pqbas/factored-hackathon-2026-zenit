# Requirements: Roles y navegación por rol

Con esta fase, la app lee el rol del usuario de `GET /api/session` y muestra
solo las secciones que ese rol puede usar, según la matriz de acceso que definió
el usuario. Consume el contrato aprobado con el back, que llega en el PR de la
Fase 2 del back: `{ user: { email, name?, preferredUsername?, role } }`, con
`role` en `'admin' | 'advisor' | 'customer'`. No cambia ninguna pantalla por
dentro.

## 1. Functional requirements

Después de esta fase, la app debe seguir haciendo lo que hace hoy:

1. El asistente, Mis productos y Chats funcionan igual para quien tenga
   acceso.
2. El avatar y el cambio de tema siguen en el riel.

Y cambia en estas cosas:

3. El riel muestra solo las secciones que el rol permite:

   | Sección                     | customer | advisor | admin |
   | --------------------------- | -------- | ------- | ----- |
   | Asistente (`/`, `/chat/:id`) | sí       | sí      | sí    |
   | Mis productos (`/products`) | sí       | no      | sí    |
   | Chats (`/conversations`)    | no       | sí      | sí    |

4. Entrar por URL a una sección que el rol no permite muestra una pantalla
   "Sin acceso" con un enlace al asistente.
5. Si la sesión no trae `role`, o trae un valor desconocido, el usuario es
   `customer`.
6. Mientras la sesión carga, las secciones con acceso restringido no muestran
   su contenido.

## 2. Decisions

- Sin `role` el usuario es `customer`, nunca `admin`, porque la fase puede
  llegar a `main` antes que el back que lo manda y el rol de menos permisos es
  el seguro.
- El rol solo decide qué se muestra. Los permisos los valida el back (403 en
  `/api/admin`, `requireAdvisor` en la consola), porque el front se puede
  manipular.
- La matriz vive en un solo archivo (`src/lib/roles.ts`) y el riel y las rutas
  la leen de ahí, así un cambio de permisos toca un solo lugar.
- La sección Admin (vista de todas las conversaciones) no entra: llega en la
  Fase 6 y se suma a la matriz como solo admin.
- Para probar en local antes de que el back mande el rol, `npm run dev` acepta
  un rol de prueba en `localStorage` (`dev:role`). Solo existe en dev
  (`import.meta.env.DEV`), porque en producción el rol sale solo del back.
- Los e2e mockean `GET /api/session` con `page.route`, porque el back de
  `main` todavía no manda `role`.

## 3. Context

- `spec/roadmap.md`: Phase 5, Roles y navegación por rol (contrato y matriz).
- Existing patterns: `src/contexts/SessionContext.tsx` (sesión),
  `src/components/nav-rail.tsx` (secciones del riel), `src/App.tsx` (rutas).
