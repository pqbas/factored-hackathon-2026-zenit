# Requirements: Vista admin con conversaciones reales

Con esta fase, un admin tiene una sección propia en el riel ("Admin") donde ve
las conversaciones de todos los usuarios y las lee sin poder modificarlas.
Consume la API admin del back que ya está en `main` (PR #15):

- `GET /api/admin/chats?limit=&ending_before=&userId=` → `{ chats, hasMore }`,
  la misma forma que `/api/history`; cada chat trae `userId` y `userEmail`
  (`null` en chats anteriores a la migración).
- `GET /api/admin/users` → `{ users: [{ userId, userEmail }] }`.
- `GET /api/admin/chats/:id/messages` → los mensajes, como
  `GET /api/messages/:id`.
- 403 si no es admin, 404 si el chat no existe, 204 sin base de datos.

## 1. Functional requirements

Después de esta fase, la app debe seguir haciendo lo que hace hoy:

1. Asistente, Mis productos y Chats funcionan igual para sus roles.
2. El historial del asistente sigue mostrando los chats del usuario, ahora
   sin las insignias viejas del flujo anterior.

Y cambia en estas cosas:

3. El riel muestra "Admin" solo al rol admin; `/admin` para otro rol muestra
   "Sin acceso".
4. La lista muestra las conversaciones de todos los usuarios, de la más
   reciente a la más antigua, con el título, el email del dueño y la fecha. Un
   chat sin email muestra "Sin email".
5. Un filtro por usuario lista los dueños de `GET /api/admin/users` y pide la
   lista con `userId`.
6. "Cargar más" trae la siguiente página mientras `hasMore` sea verdadero.
7. Elegir una conversación la muestra completa en solo lectura: mensajes del
   usuario y del asistente, sin campo para escribir.
8. Si el back responde 403, la sección muestra "Sin acceso"; si responde 204,
   muestra que no hay base de datos y por eso no hay conversaciones.

## 2. Decisions

- Admin es una sección aparte de Chats, porque Chats es la consola del asesor
  (responder) y Admin es solo lectura de todo.
- La lista y el visor usan solo la API admin, nunca `/api/chat/:id`, porque
  esa ruta respeta la visibilidad del chat y el admin tiene que leer también
  los privados.
- El visor muestra solo las partes de texto de cada mensaje y una línea
  "Usó una herramienta" para las demás, porque el componente `Messages` del
  chat depende del estado de `useChat` y la vista no necesita interacción.
- No se usan los filtros `status`, `intent` ni `customer`: la Fase 3 del back
  los cambia (`handledBy`, `useCase`) y se suman cuando esté en `main`.
- Los e2e mockean la API admin con `page.route`, porque el modo efímero de los
  tests no tiene base de datos y la API responde 204.

## 3. Context

- `spec/roadmap.md`: Phase 6, Vista admin con conversaciones reales.
- `back/server/src/routes/admin.ts`: la API.
- Existing patterns: `src/components/sidebar-history.tsx` (paginación con
  `useSWRInfinite`), `src/pages/ProductsPage.tsx` y
  `src/components/products/product-list.tsx` (sección con lista inset +
  contenido), `src/lib/roles.ts` (matriz), `src/lib/utils.ts`
  (`convertToUIMessages`).
