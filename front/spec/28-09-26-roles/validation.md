# Validation: Roles y navegación por rol

La fase está lista para mergear cuando se cumple todo lo siguiente y la Fase 2
del back ya está en `main`.

## Automated Tests

- [ ] `npm run build` en `front/` termina sin errores.
- [ ] `npm test` en `front/` termina con exit code 0.
- [ ] En `back/`, con `front/dist` recién compilado:
      `FRONT_URL=http://localhost:3100 PORT=3100 NODE_ENV=production TEST_MODE=ephemeral PLAYWRIGHT=True npx playwright test tests/e2e/roles.test.ts tests/e2e/conversations.test.ts tests/e2e/products.test.ts tests/e2e/demo-customer.test.ts --project=e2e`
      termina con exit code 0.
- [ ] `grep -rn "style={{" front/src/components/require-section.tsx` no
      devuelve nada.

### Specific test coverage required

#### Unit

- [ ] `roleOf` devuelve `customer` sin sesión, sin `role` o con un rol
      desconocido, y el rol de la sesión cuando es válido.
- [ ] `canAccess` cumple la matriz completa.
- [ ] `sectionForPath` asigna `/`, `/chat/:id`, `/products` y `/conversations`.

#### Integration

No aplica: el front no tiene setup de tests de componentes y el e2e cubre la
unión entre las piezas.

#### End-to-end

- [ ] customer, advisor y admin ven en el riel solo sus secciones.
- [ ] Una URL fuera del rol muestra "Sin acceso".
- [ ] Una sesión sin `role` se comporta como customer.

## Manual Checks

Con `npm run dev` en `front/` y el back corriendo:

- [ ] Sin `dev:role` y con el back de `main` → riel de customer.
- [ ] `localStorage.setItem('dev:role', 'advisor')` y recargar → Asistente y
      Chats; `/products` muestra "Sin acceso".
- [ ] `dev:role = 'admin'` → las tres secciones.
- [ ] Con el back que ya manda `role` y un email en `ADVISOR_EMAILS` → riel de
      asesor sin tocar `localStorage`.

## Definition of Done

Todas las casillas marcadas, la Fase 2 del back en `main`, y sin `console.log`
de depuración ni `style={{}}` nuevos.
