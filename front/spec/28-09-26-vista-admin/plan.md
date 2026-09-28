# Plan: Vista admin con conversaciones reales

Rama: `feat/pqbas-front-phase6-vista-admin`, desde `main`. Solo utilidades de
Tailwind v4; nada de `style={{}}`.

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `src/components/sidebar-history-item.tsx` | existing | Modified: sin insignias viejas |
| `src/lib/roles.ts` | existing | Modified: sección `admin` (solo admin) |
| `src/lib/admin.ts` | — | New: claves de página, `ownerLabel`, `messageSummary`, fetch con estados |
| `src/components/admin/admin-chat-list.tsx` | — | New: lista, filtro por usuario, cargar más |
| `src/components/admin/admin-chat-view.tsx` | — | New: visor de solo lectura |
| `src/pages/AdminPage.tsx` | — | New |
| `src/components/nav-rail.tsx`, `src/App.tsx` | existing | Modified: ruta y entrada "Admin" |
| `tests/unit/admin.test.ts`, `tests/unit/roles.test.ts` | — / existing | New / Modified |
| `back/tests/e2e/admin.test.ts` | — | New |

---

## Group 1: Lógica

1. En `src/lib/roles.ts`, sumar `admin: ['admin']` a la matriz y
   `/admin` a `sectionForPath`.
2. Crear `src/lib/admin.ts`:
   - `adminChatsKey(userId)(pageIndex, previousPage)`: como
     `getChatHistoryPaginationKey`, contra `/api/admin/chats`, con `userId`
     si hay uno.
   - `ownerLabel(email)`: el email o "Sin email".
   - `messageSummary(message)`: texto de las partes `text` y si usó
     herramientas.
   - `adminFetch(url)`: 403 → error `forbidden`, 204 → `null` (sin base).

## Group 2: UI

3. `src/components/admin/admin-chat-list.tsx`: `Sidebar variant="inset"
   className="md:left-16"`, encabezado "Todas las conversaciones", menú de
   usuario (`data-testid="admin-user-filter"`), filas
   (`data-testid="admin-chat-row-<id>"`) con título, `ownerLabel` y fecha, y
   "Cargar más" (`data-testid="admin-load-more"`).
4. `src/components/admin/admin-chat-view.tsx`: encabezado con título, dueño y
   fecha, y burbujas de solo lectura (`data-testid="admin-message"`); sin
   composer.
5. `src/pages/AdminPage.tsx`: estado de usuario y chat elegidos, estados de
   carga, 403 y 204.
6. `src/App.tsx` y `src/components/nav-rail.tsx`: ruta `/admin` con
   `RequireSection section="admin"` y entrada "Admin" (icono `ShieldCheck`).

## Group 3: Tests

7. Unit: `tests/unit/admin.test.ts` (`adminChatsKey`, `ownerLabel`,
   `messageSummary`) y `tests/unit/roles.test.ts` (matriz con `admin`).
8. Integration: no aplica; el e2e cubre la unión.
9. E2E: `back/tests/e2e/admin.test.ts` con sesión admin y la API mockeada:
   lista con "Sin email", filtro manda `userId`, cargar más, visor de solo
   lectura, 403 → "Sin acceso", 204 → sin base de datos, y un advisor no ve
   "Admin".
