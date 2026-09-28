# Validation: Roles y navegación por rol

La fase está lista para mergear cuando se cumple todo lo siguiente y la Fase 2
del back ya está en `main`.

## Automated Tests

- [x] `npm run build` en `front/` termina sin errores.
- [x] `npm test` en `front/` termina con exit code 0.
- [x] En `back/`, con `front/dist` recién compilado:
      `FRONT_URL=http://localhost:3100 PORT=3100 NODE_ENV=production TEST_MODE=ephemeral PLAYWRIGHT=True npx playwright test tests/e2e/roles.test.ts tests/e2e/conversations.test.ts tests/e2e/products.test.ts tests/e2e/demo-customer.test.ts --project=e2e`
      termina con exit code 0.
- [x] `grep -rn "style={{" front/src/components/require-section.tsx` no
      devuelve nada.

### Specific test coverage required

#### Unit

- [x] `roleOf` devuelve `customer` sin sesión, sin `role` o con un rol
      desconocido, y el rol de la sesión cuando es válido.
- [x] `canAccess` cumple la matriz completa.
- [x] `sectionForPath` asigna `/`, `/chat/:id`, `/products` y `/conversations`.

#### Integration

No aplica: el front no tiene setup de tests de componentes y el e2e cubre la
unión entre las piezas.

#### End-to-end

- [x] customer, advisor y admin ven en el riel solo sus secciones.
- [x] Una URL fuera del rol muestra "Sin acceso".
- [x] Una sesión sin `role` se comporta como customer.

## Manual Checks

Los tres primeros se revisaron con un Vite de dev en local; el último queda
para cuando la Fase 2 del back esté en `main`.

Con `npm run dev` en `front/` y el back corriendo:

- [x] Sin `dev:role` y con el back de `main` → riel de customer.
- [x] `localStorage.setItem('dev:role', 'advisor')` y recargar → Asistente y
      Chats; `/products` muestra "Sin acceso".
- [x] `dev:role = 'admin'` → las tres secciones.
- [ ] Con el back que ya manda `role` y un email en `ADVISOR_EMAILS` → riel de
      asesor sin tocar `localStorage`.

## Definition of Done

Todas las casillas marcadas, la Fase 2 del back en `main`, y sin `console.log`
de depuración ni `style={{}}` nuevos.
