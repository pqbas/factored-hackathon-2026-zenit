# Validation: credenciales demo en el login

La fase se puede mergear cuando pasa todo lo siguiente.

## Automated Tests

- `cd back && npx tsc --noEmit -p server` sin errores.
- `cd front && npm run build` sin errores.
- `cd front && npx vitest run tests/unit/auth.test.ts` pasa.
- `cd back && npx playwright test tests/ai-sdk-provider tests/routes/auth-mode.test.ts` pasa.
- `cd back && npx playwright test tests/e2e/login.test.ts` pasa (una sola suite Playwright a la vez).

### Specific test coverage required

**Unit**
- `parseDemoLogins` devuelve las filas con JSON válido y `[]` sin valor, con JSON roto y con esquema inválido.
- `fetchDemoLogins` devuelve `[]` ante 404, error de red y forma inválida.

**Integration**
- `GET /api/demo-logins` en password mode y sin cookie devuelve `{ logins }` con la variable y `{ logins: [] }` sin ella.
- En modo Databricks responde 404.

**End-to-end**
- La tabla aparece con filas, clic en una fila llena usuario y contraseña, y el login entra.
- Con `{ logins: [] }` la tabla no aparece.

## Manual Checks

- En AWS (https://wzmpasrvja.us-west-2.awsapprunner.com), sin sesión, el login muestra la tabla con admin, asesor y cliente.
- Clic en cada fila y "Ingresar" entra con el rol correcto.
- La configuración del servicio en App Runner muestra `DEMO_LOGINS_JSON` como secret (ARN), no como valor plano.
- `git grep` de las tres contraseñas en el repo no encuentra nada.

## Definition of Done

Los tests pasan, el PR está mergeado en `main`, y el login de AWS muestra las tres credenciales y permite entrar con un clic más "Ingresar".
