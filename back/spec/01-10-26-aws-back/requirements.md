# Requirements: Back y front en AWS, con login de demo

Etapa 1 de `spec/01-10-26-despliegue-aws/` (bloques 3 y 4), aprobada por el
usuario vía w1:pB (01-10-26). El mismo back de main, con el front compilado,
corre en AWS App Runner, en paralelo a Databricks Apps, que no se toca.

En Databricks Apps la identidad llega en los headers `X-Forwarded-*` que pone
la plataforma. En AWS no hay quien los ponga, y cualquiera podría mandarlos.
Por eso AWS usa un login propio y deja de confiar en esos headers.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. En Databricks Apps y en local nada cambia: la identidad sale de los
   headers (o del CLI), `AUTH_MODE` no está definido y `GET /api/session`
   solo suma `authMode: 'databricks'`.
2. Los roles salen de `ADMIN_EMAILS` y `ADVISOR_EMAILS`, como hoy.
3. Los tests siguen con su base de pruebas y sus headers.

And it changes in these ways:

4. **Modo password** (`AUTH_MODE=password`, solo en AWS):
   - el back ignora los headers `X-Forwarded-*`;
   - la sesión sale de la cookie `bank_session`, firmada con
     `SESSION_SECRET`: HttpOnly, SameSite=Lax, 12 horas y Secure. Solo una
     corrida local por http la manda sin Secure
     (`SESSION_COOKIE_INSECURE=true`);
   - si falta `SESSION_SECRET` o `DEMO_USERS_JSON`, el back arranca pero
     `/ping` responde 503, para que el deploy falle su health check en vez
     de quedar medio vivo (revisión de w1:pB);
   - el back no acepta credenciales de otros orígenes (sin CORS).
5. **Contrato del login**, acordado con w1:pD:
   - `GET /api/session` devuelve `{ user, authMode }`, con `user: null` sin
     sesión;
   - `POST /api/login { username, password }` devuelve 200 con el cuerpo de
     `/api/session` y deja la cookie; 401 `{ code: 'invalid_credentials' }`
     si falla; 429 `{ code: 'too_many_attempts' }` tras 10 intentos fallidos
     por IP en 5 minutos. La IP es la última de `X-Forwarded-For`, la que
     agrega el proxy de App Runner; las anteriores las controla el cliente;
   - `POST /api/logout` devuelve 204 y borra la cookie;
   - todo `/api/*` sin sesión devuelve 401 `{ code: 'unauthorized' }`, salvo
     session, login y logout.
6. **Usuarios fijos**: `admin`, `asesor` y `cliente`.
   - Vienen de `DEMO_USERS_JSON`: `[{ username, email, name, passwordHash }]`,
     con hash scrypt. Las contraseñas no están en el repo ni en la imagen.
   - El email de cada uno decide el rol con las listas de siempre.
7. **Imagen Docker** del back con el front compilado adentro, que escucha en
   el puerto 8080 y responde `/ping`. La imagen no corre migraciones.
8. **Datos y agente con un service principal de Databricks**
   (`DATABRICKS_HOST`, `DATABRICKS_CLIENT_ID`, `DATABRICKS_CLIENT_SECRET`):
   - las conversaciones (`ai_chatbot`) y `bank_ro` en Lakebase, con el token
     OAuth que el back ya renueva;
   - el agente de Databricks Apps por `API_PROXY`, con ese mismo token.
9. **Cola de turnos apagada en AWS** con `AGENT_QUEUE_WORKER=off`. El worker
   de Databricks Apps contesta los turnos que encole AWS.
10. **Deploy reproducible**: `scripts/aws/deploy.sh` construye la imagen, la
    sube a ECR con el sha de git y despliega en App Runner sin corte.
    `scripts/aws/setup.sh` crea una sola vez el repositorio, los secretos,
    los roles y el servicio.

## 2. Decisions

- El modo se elige con `AUTH_MODE`, no por la presencia de headers, para
  que un header falso no dé identidad en AWS.
- Cookie firmada con HMAC y sin estado en el servidor: no hace falta una
  tabla de sesiones ni una migración, y App Runner puede escalar instancias.
- Hash scrypt de `node:crypto`, sin dependencias nuevas. Un script genera el
  hash.
- El id de usuario de la demo es su email. Los chats de la demo en AWS
  quedan con ese id y no se mezclan con los de los usuarios de Databricks.
- Secretos en Secrets Manager, inyectados por App Runner como variables:
  el secreto del SP, `SESSION_SECRET` y `DEMO_USERS_JSON`. Lo no secreto va
  como variable normal del servicio.
- Scripts con el AWS CLI, sin Terraform ni CDK: son 5 recursos y quedan 4
  días.
- Las migraciones las sigue aplicando el deploy de Databricks. AWS usa la
  misma base, así que se despliega primero Databricks cuando haya una nueva.
- App Runner: us-west-2, 1 vCPU / 2 GB, health check HTTP en `/ping`.
- Fuera de alcance: login corporativo (Cognito, SSO), cambio de contraseña,
  el agente en AWS (etapa 2) y el examen contra AWS (bloque 6).

## 3. Context

- `spec/01-10-26-despliegue-aws/`: la spec general.
- `back/packages/auth/src/databricks-auth.ts`: `getAuthSession`, que hoy
  confía en `X-Forwarded-User`.
- `back/server/src/middleware/auth.ts`, `routes/session.ts`, `roles.ts`.
- `back/server/src/agent-queue.ts`: `startAgentQueueWorker`.
- `back/app.yaml`: las variables de prod en Databricks.
- Prerrequisitos del usuario, que faltan: la sesión de AWS y el service
  principal con CAN_USE sobre la App del agente, permisos en `ai_chatbot` y
  lectura de `bank_ro` y `bank_sessions`. Hasta tenerlos no se crea nada en
  AWS.
