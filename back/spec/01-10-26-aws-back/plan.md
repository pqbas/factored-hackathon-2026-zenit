# Plan: Back y front en AWS, con login de demo

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `back/server/src/demo-auth.ts` | — | Nuevo: usuarios, hash, cookie firmada, límite de intentos |
| `back/server/src/routes/auth.ts` | — | Nuevo: `POST /api/login`, `POST /api/logout` |
| `back/server/src/middleware/auth.ts` | existente | Modificado: sesión por cookie en modo password; guard de `/api/*` |
| `back/server/src/routes/session.ts` | existente | Modificado: `authMode` |
| `back/server/src/index.ts` | existente | Modificado: rutas, guard, validación al arrancar, `AGENT_QUEUE_WORKER` |
| `back/scripts/aws/hash-password.mjs` | — | Nuevo |
| `back/scripts/aws/setup.sh`, `deploy.sh`, `README.md` | — | Nuevos |
| `Dockerfile.back`, `Dockerfile.back.dockerignore` (raíz del repo) | — | Nuevos |
| `back/tests/ai-sdk-provider/demo-auth.test.ts` | — | Nuevo |
| `back/tests/ai-sdk-provider/login.test.ts` | — | Nuevo |
| `back/.env.example` | existente | Modificado: variables nuevas |

---

## Group 1: Login de demo

1. `demo-auth.ts`, funciones puras:
   - `parseDemoUsers(raw)` valida `DEMO_USERS_JSON` con zod;
   - `hashPassword` y `verifyPassword` con scrypt y comparación en tiempo
     constante;
   - `signSession({ username, exp }, secret)` y `readSession(cookie, secret,
     now)`, con HMAC-SHA256; un valor alterado o vencido da `null`;
   - un contador de intentos fallidos por IP, en memoria.
2. `middleware/auth.ts`:
   - en modo password, `authMiddleware` arma la sesión desde la cookie y
     nunca lee los headers;
   - `requireSessionInPasswordMode` responde 401 `{ code: 'unauthorized' }`
     a los `/api/*` sin sesión.
3. `routes/auth.ts`: login y logout. En modo databricks las dos rutas
   responden 404.
4. `routes/session.ts`: suma `authMode`.
5. `index.ts`:
   - monta `/api/login` y `/api/logout`, y el guard antes de los demás
     routers;
   - en modo password, si falta `SESSION_SECRET` o `DEMO_USERS_JSON` no es
     válido, `/ping` responde 503 y el login 503;
   - no arranca el worker con `AGENT_QUEUE_WORKER=off`.

## Group 2: Imagen

6. `Dockerfile.back`, multi-etapa sobre `node:22-slim`, con el repo como
   contexto:
   - compila el front y el server, y copia el front a `server/public`;
   - la etapa final lleva solo lo necesario para `npm run start`, corre con
     un usuario sin privilegios y expone 8080.
7. `Dockerfile.back.dockerignore`: solo entran `back/` y `front/`, sin
   `node_modules`, `.env*`, tests ni scripts.

## Group 3: AWS (no se ejecuta hasta tener la sesión de AWS y el SP)

8. `setup.sh`, idempotente:
   - repositorio ECR;
   - secretos en Secrets Manager, leídos de variables del shell, nunca de un
     archivo del repo;
   - rol de acceso a ECR y rol de instancia con lectura de esos secretos;
   - servicio App Runner con las variables y los secretos.
9. `deploy.sh`: build, push con el tag del sha, `update-service` y espera a
   RUNNING. Al final consulta `/ping` y `/api/session`.
10. `README.md`: prerrequisitos, variables, cómo desplegar y cómo volver a
    la imagen anterior.

## Group 4: Tests

11. Unit, `demo-auth.test.ts`:
    - hash y verificación;
    - cookie válida, alterada y vencida;
    - `DEMO_USERS_JSON` inválido;
    - límite de intentos.
12. Integration: no hay capa separada.
13. End-to-end, `login.test.ts`, contra una app Express levantada en el
    test con el middleware y los routers reales, en modo password. No usa
    base, así que corre aunque el Postgres de pruebas esté caído. Los demás
    tests siguen en modo databricks.
    - `/api/session` sin cookie da `user: null` y `authMode: 'password'`;
    - login correcto deja la cookie, y la sesión trae el rol de cada
      usuario;
    - contraseña mala da 401, y la 11ª da 429 aunque cambie la primera IP
      de `X-Forwarded-For`;
    - `/api/history` sin cookie da 401 `unauthorized`;
    - un `X-Forwarded-User` falso no da sesión;
    - una cookie alterada no da sesión;
    - logout vence la cookie.
