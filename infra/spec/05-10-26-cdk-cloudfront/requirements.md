# Requirements: despliegue en AWS con CDK y CloudFront

Un despliegue nuevo de Zenit en AWS, definido con AWS CDK (TypeScript) en `infra/`, que reproduce lo que hoy crean los scripts de bash (`back/scripts/aws/`, `agent/scripts/aws/`) y agrega CloudFront delante: el front sale de S3 y `/api/*` va al back en App Runner. Corre en paralelo al despliegue actual (`bank-assistant-back`, `bank-assistant-agent`), que no se toca. No cambia el código del back, del front ni del agente, ni sus contratos.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. Los servicios actuales `bank-assistant-back` y `bank-assistant-agent`, sus roles y su configuración quedan iguales.
2. Las mismas imágenes de ECR (`bank-assistant-back`, `bank-assistant-agent`) y los mismos secrets de Secrets Manager sirven a los dos despliegues.

And it changes in these ways:

3. `cdk deploy` crea el stack `ZenitStack` en la cuenta 335741630127, us-west-2, con todo etiquetado `project=zenit`.
4. El stack tiene dos servicios App Runner nuevos, `zenit-back` y `zenit-agent`, con la misma configuración que los actuales: 1 vCPU y 2 GB, puerto 8080, health check (`/ping` el back, `/health` el agente; HTTP, cada 10 s, timeout 5 s, 1 sano, 3 fallidos), las mismas variables y los mismos secrets.
5. El back nuevo llama al agente nuevo: `API_PROXY` es `https://<url de zenit-agent>/invocations`, con el mismo token compartido (`bank-assistant/agent/invoke-token`).
6. Una distribución de CloudFront sirve el front compilado desde un bucket S3 privado (Origin Access Control) y manda `/api/*` y `/ping` al back, sin caché.
7. Las rutas del front (`/chat/...`, `/conversations`, `/products`, `/metrics`) cargan `index.html` en CloudFront; las respuestas de `/api/*`, incluidos sus 401 y 404, llegan tal cual.
8. Login, sesión (cookie), chat con streaming, consola del asesor y métricas funcionan entrando por la URL de CloudFront.
9. La imagen de cada servicio se elige por tag al desplegar (contexto `backTag` y `agentTag`).

## 2. Decisions

- Stack nuevo en paralelo y no import de los recursos actuales, porque así se prueba sin tocar lo que usa la demo. El corte y el borrado de los servicios viejos quedan fuera de esta fase y son decisión del usuario.
- App Runner con el L1 `CfnService` y no con el L2 alpha, porque `aws-apprunner-alpha` es experimental y el L1 se mapea uno a uno con la configuración de los scripts, que es la que ya funciona.
- Los secrets y los repositorios de ECR se referencian por ARN o por nombre; CDK no crea secrets ni lee sus valores. Los ARN completos (con sufijo) están en `infra/config.ts`, porque App Runner pide el ARN completo y un ARN no es secreto.
- `DATABRICKS_HOST` y `DATABRICKS_CLIENT_ID` salen del JSON del secret del service principal con una referencia dinámica de CloudFormation (`{{resolve:secretsmanager:...}}`), como hacían los scripts al leerlos del mismo secret: una sola fuente y nada que copiar a mano.
- `DEMO_CUSTOMERS_JSON` y `DEMO_SESSIONS_JSON` se leen de `back/app.yaml` y `agent/app.yaml`, la fuente que ya usan los scripts. `PGHOST` y los emails de roles van en `infra/config.ts`; no son secretos.
- Los roles de instancia leen solo los ARN exactos que usa cada servicio, en lugar del comodín `bank-assistant/back/*` de los scripts: menos privilegio con el mismo resultado.
- El back y el agente nuevos usan los mismos service principals de Databricks que los actuales, porque los permisos en Lakebase y en el endpoint del LLM son por principal y crear otros no aporta nada para la demo.
- `/api/*` y `/ping` usan la política administrada `CachingDisabled` y `AllViewerExceptHostHeader`: pasan cookies, query strings y headers, menos `Host`, porque App Runner enruta por su propio host.
- El rewrite a `index.html` lo hace una CloudFront Function en el behavior del front y no las respuestas de error personalizadas, porque esas reemplazarían también los 403/404 de `/api/*`.
- `/api/*` tiene `compress: false` y read timeout de 60 s (el máximo sin pedir cuota), para que el stream SSE del chat no se acumule. El back manda `start` al empezar el turno y el turno más lento medido fue de 22.76 s, así que 60 s alcanzan.
- La cookie de sesión es host-only (`Path=/; HttpOnly; SameSite=Lax; Secure`, sin `Domain`), así que funciona con el dominio de CloudFront sin cambios en el back. CORS no aplica: el front y la API comparten origen.
- `AGENT_QUEUE_WORKER=on` en el back nuevo, porque tiene que funcionar solo después del corte. Dos workers sobre la misma cola son seguros: `claimAgentTurns` usa `FOR UPDATE SKIP LOCKED` y un lease. Mientras convivan, la caché de streams es en memoria por back, así que un turno encolado en uno puede tomarlo el worker del otro sin ver el stream activo; es el mismo caso que App Runner con más de una instancia, y para la demo se usa una sola URL a la vez.
- El bucket se borra con el stack (`autoDeleteObjects`), porque solo tiene el build del front, que se regenera.
- Costo con tráfico de demo: CloudFront ≈ USD 0 (capa gratuita: 1 TB y 10 M de requests al mes), S3 centavos, y los dos App Runner nuevos ≈ USD 1 por día mientras convivan con los actuales.
- Dominio propio y certificado quedan fuera; se usa el dominio `*.cloudfront.net`.

- Cambio del 05/10/2026: CloudFront queda opcional (`-c cloudfront=on`) y apagado, porque la cuenta de AWS no está verificada para CloudFront y además tiene un tope de 2 App Runner por región. No hubo despliegue en paralelo: se borraron `bank-assistant-*` y el stack los reemplaza. En producción CloudFront va encendido (`docs/camino-a-produccion.md` §6).

## 3. Context

- `back/scripts/aws/common.sh`, `setup.sh`, `deploy.sh`, `README.md`: recursos, variables y secrets del back.
- `agent/scripts/aws/common.sh`, `setup.sh`, `deploy.sh`, `README.md`: lo mismo para el agente.
- `back/server/src/index.ts`: rutas `/ping` y `/api/*`, CORS, el back también sirve el front.
- `back/server/src/demo-auth.ts`: `sessionCookie` (atributos de la cookie).
- `back/server/src/agent-queue.ts` y `claimAgentTurns` en `back/packages/db/src/queries.ts`: la cola de turnos.
- `back/server/src/routes/chat.ts`: el stream (`pipeUIMessageStreamToResponse`) y `GET /api/chat/:id/stream`.
- `docs/camino-a-produccion.md` §6: CloudFront e infraestructura como código como pendientes.
