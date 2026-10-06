# Plan: credenciales demo en el login

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `back/server/src/demo-auth.ts` | existente | Modified: `parseDemoLogins(raw)` |
| `back/server/src/routes/auth.ts` | existente | Modified: `GET /demo-logins` con `passwordModeOnly` |
| `back/server/src/middleware/auth.ts` | existente | Modified: `/api/demo-logins` en `OPEN_API_PATHS` |
| `back/scripts/aws/setup.sh` | existente | Modified: secret opcional `demo-logins` y `DEMO_LOGINS_JSON` en el servicio |
| `back/scripts/aws/README.md` | existente | Modified: cómo crear el secret |
| `front/src/lib/auth.ts` | existente | Modified: `fetchDemoLogins()` |
| `front/src/pages/LoginPage.tsx` | existente | Modified: tabla de credenciales, clic llena el formulario |
| `front/src/lib/i18n.ts` | existente | Modified: textos es/pt |

---

## Group 1: Back

1. En `back/server/src/demo-auth.ts`, agregar `parseDemoLogins(raw: string | undefined): { username: string; password: string }[]`:
   - Esquema zod: array de `{ username: string.min(1), password: string.min(1) }`.
   - Sin `raw`, JSON inválido o esquema inválido → `[]` (nunca lanza; a diferencia de `parseDemoUsers`).

2. En `back/server/src/routes/auth.ts`, agregar `authRouter.get('/demo-logins', passwordModeOnly, ...)` que responde `{ logins: parseDemoLogins(process.env.DEMO_LOGINS_JSON) }`.

3. En `back/server/src/middleware/auth.ts`, sumar `/api/demo-logins` a `OPEN_API_PATHS`, para que `requireSessionInPasswordMode` no pida sesión.

---

## Group 2: Despliegue

4. En `back/scripts/aws/setup.sh`:
   - `secrets`: si `DEMO_LOGINS_JSON` está en el entorno, `put_secret demo-logins "$DEMO_LOGINS_JSON"`; si no, no hace nada.
   - `service`: si existe el secret `$SECRET_PREFIX/demo-logins`, sumarlo a `RuntimeEnvironmentSecrets` como `DEMO_LOGINS_JSON`.

5. En `back/scripts/aws/README.md`, documentar el secret opcional y que quitarlo oculta la tabla.

6. En prod (con OK del usuario): crear `bank-assistant/back/demo-logins` a partir de `bank-assistant/back/demo-passwords`, sin imprimir valores; actualizar el servicio y desplegar con `scripts/aws/deploy.sh`.

---

## Group 3: Front

7. En `front/src/lib/auth.ts`, agregar `fetchDemoLogins(): Promise<{ username: string; password: string }[]>`: `GET /api/demo-logins`; ante error de red, status no 200 o forma inesperada → `[]`.

8. En `front/src/pages/LoginPage.tsx`:
   - `useEffect` que llama `fetchDemoLogins()` una vez y guarda las filas.
   - Debajo del formulario, si hay filas: título `t.auth.demoTitle` y tabla con columnas `t.auth.username` / `t.auth.password`, `data-testid="demo-logins"`, una fila por usuario con `data-testid="demo-login-<username>"`.
   - Clic (o Enter) en una fila: `setUsername`, `setPassword`, limpiar el error.

9. En `front/src/lib/i18n.ts`, agregar `auth.demoTitle` ("Usuarios de la demo" / "Usuários da demo") y `auth.demoHint` ("Haz clic en una fila para usarla" / "Clique em uma linha para usá-la").

---

## Group 4: Tests

10. Unit, `back/tests/ai-sdk-provider/demo-auth.test.ts`: `parseDemoLogins` con JSON válido, sin valor, JSON roto y esquema inválido.

11. Integration, `back/tests/ai-sdk-provider/login.test.ts`: `GET /api/demo-logins` sin cookie devuelve las filas con la variable, `[]` sin ella; en modo Databricks, 404 (`back/tests/routes/auth-mode.test.ts`).

12. Unit, `front/tests/unit/auth.test.ts`: `fetchDemoLogins` devuelve `[]` ante 404, error de red y forma inválida.

13. E2E, `back/tests/e2e/login.test.ts`: con `/api/demo-logins` mockeado, la tabla aparece, clic en "cliente" llena el formulario y el login entra; con `{ logins: [] }`, la tabla no aparece.
