# Requirements: credenciales demo en el login

La pantalla de login del despliegue de AWS (password mode) muestra una tabla con los tres usuarios demo (admin, asesor, cliente) y sus contraseñas, para que quien vea la demo del hackathon entre sin pedirlas. Las contraseñas no entran al repo ni a la imagen: el back las lee de una variable de entorno opcional y el front las pide al back. No cambia el login (`POST /api/login`), ni la sesión, ni el modo Databricks.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. El login valida usuario y contraseña contra `DEMO_USERS_JSON` (hashes scrypt), con el mismo límite de intentos.
2. En modo Databricks no hay login ni rutas de password mode (404).

And it changes in these ways:

3. Con `DEMO_LOGINS_JSON` definida y `AUTH_MODE=password`, `GET /api/demo-logins` responde `{ logins: [{ username, password }] }` sin pedir sesión.
4. Sin `DEMO_LOGINS_JSON`, o con un JSON inválido, `GET /api/demo-logins` responde `{ logins: [] }` y el back arranca igual.
5. En modo Databricks, `GET /api/demo-logins` responde 404, como las otras rutas de password mode.
6. La pantalla de login muestra debajo del formulario una tabla "Usuario / Contraseña" con las filas que devuelve el back. Sin filas, la tabla no aparece.
7. Al hacer clic en una fila, el formulario se llena con ese usuario y contraseña; el usuario todavía tiene que pulsar "Ingresar".
8. Los textos de la tabla están en español y portugués, como el resto del login.

## 2. Decisions

- Las contraseñas vienen del back en runtime y no de una constante del front, porque el repo y la imagen no deben tener secretos y las contraseñas se pueden rotar sin rebuild.
- La variable es opcional y aparte de `DEMO_USERS_JSON`, porque esta solo guarda hashes; mostrar las credenciales es una decisión de la demo, que se apaga quitando la variable.
- En App Runner, `DEMO_LOGINS_JSON` sale de un secret de Secrets Manager (`bank-assistant/back/demo-logins`), como los demás, y no de una variable plana, para que no se vea en la configuración del servicio.
- La ruta es pública (sin sesión), porque se usa antes de iniciar sesión. Es aceptable solo porque es una demo de hackathon; en producción no se define la variable.
- Clic en la fila llena el formulario pero no inicia sesión, porque así se ve qué usuario se eligió y el flujo de login sigue siendo el mismo.
- No hay botón de copiar ni ocultar contraseñas, porque es scope de hackathon: lo esencial es verlas y usarlas.

## 3. Context

- `back/server/src/demo-auth.ts`: password mode, `getAuthMode`, `parseDemoUsers` (patrón de parseo con zod).
- `back/server/src/routes/auth.ts`: `passwordModeOnly` y las rutas `/api/login` y `/api/logout`.
- `back/server/src/index.ts`: dónde se monta `authRouter` y qué rutas no piden sesión.
- `back/scripts/aws/setup.sh`: `secrets` y `RuntimeEnvironmentSecrets` del servicio.
- `front/src/pages/LoginPage.tsx`, `front/src/lib/auth.ts`, `front/src/lib/i18n.ts`.
- Tests existentes: `back/tests/ai-sdk-provider/login.test.ts`, `back/tests/e2e/login.test.ts`, `front/tests/unit/auth.test.ts`.
