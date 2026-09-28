# Plan: Roles y navegación por rol

Rama: `feat/pqbas-front-phase5-roles`, desde `main`. No se mergea antes que la
Fase 2 del back. Solo utilidades de Tailwind v4; nada de `style={{}}`.

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `src/lib/roles.ts` | — | New: `Role`, `Section`, matriz, `roleOf`, `canAccess`, `sectionForPath` |
| `src/contexts/SessionContext.tsx` | existing | Modified: expone `role` |
| `src/components/nav-rail.tsx` | existing | Modified: filtra secciones por rol |
| `src/components/require-section.tsx` | — | New: guarda de ruta y pantalla "Sin acceso" |
| `src/App.tsx` | existing | Modified: envuelve las rutas con la guarda |
| `tests/unit/roles.test.ts` | — | New |
| `back/tests/e2e/roles.test.ts` | — | New |

---

## Group 1: Rol y matriz

1. Crear `src/lib/roles.ts`:
   - `type Role = 'customer' | 'advisor' | 'admin'`.
   - `type Section = 'agent' | 'products' | 'chats'`.
   - `SECTION_ROLES: Record<Section, Role[]>` con la matriz de requirements.
   - `roleOf(session)`: el `role` de la sesión si es uno de los tres; si no,
     `'customer'`. En dev, un `dev:role` válido en `localStorage` gana.
   - `canAccess(role, section)` y `sectionForPath(pathname)`.
2. En `src/contexts/SessionContext.tsx`, sumar `role: Role` al contexto,
   calculado con `roleOf(session)`.

---

## Group 2: UI

3. En `src/components/nav-rail.tsx`, cada `NavItem` suma `section` y el riel
   filtra con `canAccess(role, item.section)`.
4. Crear `src/components/require-section.tsx`:
   - `RequireSection({ section, children })`: mientras la sesión carga no
     renderiza nada; sin acceso muestra `NoAccess`; si no, `children`.
   - `NoAccess`: centrado, icono de candado, "Sin acceso", "Tu rol no puede
     ver esta sección." y un enlace "Ir al asistente" (`/`).
     `data-testid="no-access"`.
5. En `src/App.tsx`, envolver `ConversationsPage` con
   `<RequireSection section="chats">` y `ProductsPage` con
   `<RequireSection section="products">`.

---

## Group 3: Tests

6. Unit, `tests/unit/roles.test.ts`: `roleOf` (sin sesión, sin `role`, rol
   desconocido, cada rol válido, override de dev), `canAccess` contra la
   matriz completa y `sectionForPath`.
7. Integration: no hay test en esta fase. El front no tiene setup de tests de
   componentes; la unión sesión → riel → guarda la cubre el e2e.
8. End-to-end, `back/tests/e2e/roles.test.ts`, con `GET /api/session`
   mockeado con `page.route` por rol:
   - customer: el riel tiene Asistente y Mis productos, no Chats;
     `/conversations` muestra "Sin acceso".
   - advisor: Asistente y Chats, no Mis productos; `/products` muestra "Sin
     acceso".
   - admin: las tres secciones y ninguna muestra "Sin acceso".
   - Sesión sin `role`: se comporta como customer.
