# Validation: Vista admin con conversaciones reales

La fase está lista para mergear cuando se cumple todo lo siguiente.

## Automated Tests

- [x] `npm run build` y `npx tsc --noEmit -p .` sin errores nuevos en `front/`.
- [x] `npm test` en `front/` termina con exit code 0.
- [x] En `back/`, con `front/dist` recién compilado:
      `FRONT_URL=http://localhost:3100 PORT=3100 NODE_ENV=production TEST_MODE=ephemeral PLAYWRIGHT=True npx playwright test tests/e2e --project=e2e`
      termina con exit code 0.
- [x] `grep -rn "style={{" front/src/components/admin front/src/pages/AdminPage.tsx`
      no devuelve nada.

### Specific test coverage required

#### Unit

- [x] `adminChatsKey` arma la primera página, la siguiente con
      `ending_before` y corta cuando `hasMore` es falso; suma `userId`.
- [x] `ownerLabel(null)` es "Sin email".
- [x] `messageSummary` junta el texto y marca el uso de herramientas.
- [x] La matriz deja `admin` solo al rol admin.

#### Integration

No aplica: el front no tiene setup de tests de componentes.

#### End-to-end

- [x] Un admin ve la lista con emails y "Sin email".
- [x] Elegir un usuario pide `/api/admin/chats` con `userId`.
- [x] "Cargar más" trae la segunda página.
- [x] Abrir un chat muestra sus mensajes sin campo para escribir.
- [x] 403 muestra "Sin acceso" y 204 el aviso de base de datos.
- [x] Un advisor no ve "Admin" y `/admin` le muestra "Sin acceso".

## Manual Checks

Revisados con el back de `main` sirviendo `front/dist`, la base local
`chatbot_dev` (contenedor `back-test-pg`; se le aplicó la migración
`0002`, que agrega `userEmail` y le faltaba) y `ADMIN_EMAILS=admin@example.com`.

- [x] Con base de datos y un email en `ADMIN_EMAILS`: `/admin` lista los chats
      reales de varios usuarios y abre uno privado de otro usuario (babbage),
      que `curie` no puede leer por `/api/chat/:id` (403).
- [x] Con el mismo usuario fuera de `ADMIN_EMAILS`: no hay "Admin" en el riel y
      `/api/admin/chats` responde 403.

## Definition of Done

Todas las casillas marcadas y sin `console.log` de depuración ni `style={{}}`
nuevos.
