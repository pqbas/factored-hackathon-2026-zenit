# Plan: despliegue en AWS con CDK y CloudFront

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `infra/package.json`, `tsconfig.json`, `cdk.json`, `.gitignore` | — | New: proyecto CDK v2 en TypeScript |
| `infra/bin/zenit.ts` | — | New: app CDK, stack `ZenitStack` en 335741630127/us-west-2 |
| `infra/lib/config.ts` | `back/scripts/aws/setup.sh`, `agent/scripts/aws/setup.sh` | New: nombres, ARN de secrets, valores no secretos, lectura de `app.yaml` |
| `infra/lib/zenit-stack.ts` | los dos `setup.sh` | New: ECR, roles, dos `CfnService`, S3, CloudFront |
| `infra/lib/spa-rewrite.js` | — | New: código de la CloudFront Function |
| `infra/scripts/deploy.sh`, `infra/README.md` | `*/scripts/aws/deploy.sh` | New: build del front y `cdk deploy` con tags |
| `infra/tests/...` | — | New: tests |

---

## Group 1: Proyecto CDK

1. Crear `infra/package.json` con `aws-cdk-lib` y `constructs` (deps), `aws-cdk`, `typescript`, `tsx`, `vitest`, `yaml`, `@types/node` (devDeps), y scripts `build` (`tsc --noEmit`), `test` (`vitest run`), `synth` y `deploy`.
2. Crear `infra/tsconfig.json`, `infra/cdk.json` (`"app": "npx tsx bin/zenit.ts"`) y `infra/.gitignore` (`node_modules`, `cdk.out`).
3. Crear `infra/bin/zenit.ts`: `new ZenitStack(app, 'ZenitStack', { env: { account: '335741630127', region: 'us-west-2' }, backTag, agentTag, frontDist })` con los valores del contexto (`-c backTag=… -c agentTag=…`, `frontDist` por defecto `../front/dist`), y `Tags.of(app).add('project', 'zenit')`.

---

## Group 2: Configuración

4. Crear `infra/lib/config.ts`:
   - nombres: `zenit-back`, `zenit-agent`, `zenit-apprunner-ecr-access`, `zenit-back-instance`, `zenit-agent-instance`;
   - repos de ECR: `bank-assistant-back`, `bank-assistant-agent`;
   - ARN completos de los secrets que hoy usan los servicios (`describe-service`): `bank-assistant/databricks-sp`, `bank-assistant/back/session-secret`, `demo-users`, `demo-logins`, `bank-assistant/agent/invoke-token`, `bank-assistant/agent/databricks-sp`, `bank-assistant/agent/jev-api-key`;
   - valores no secretos: `PGHOST`, `ADMIN_EMAILS`, `ADVISOR_EMAILS` y las variables fijas de cada servicio (como en los `setup.sh`);
   - `readAppYamlEnv(path, name)`: lee una variable de `back/app.yaml` o `agent/app.yaml` con `yaml`; lanza si falta.

---

## Group 3: Stack

5. En `infra/lib/zenit-stack.ts`, ECR y roles:
   - `Repository.fromRepositoryName` para los dos repos;
   - rol de acceso (`build.apprunner.amazonaws.com`) con `AWSAppRunnerServicePolicyForECRAccess`;
   - un rol de instancia por servicio (`tasks.apprunner.amazonaws.com`) con `secretsmanager:GetSecretValue` solo sobre sus ARN.
6. Servicio `zenit-agent` (`CfnService`): imagen `bank-assistant-agent:<agentTag>`, 1024 CPU / 2048 MB, health check `/health`, variables del `setup.sh` del agente (`DATABRICKS_HOST`/`CLIENT_ID` por referencia dinámica al secret del agente, `DEMO_SESSIONS_JSON` de `agent/app.yaml`), secrets `DATABRICKS_CLIENT_SECRET` (`<arn>:DATABRICKS_CLIENT_SECRET::`), `JEV_API_KEY`, `AGENT_TOKEN`; `AutoDeploymentsEnabled: false`.
7. Servicio `zenit-back` (`CfnService`): imagen `bank-assistant-back:<backTag>`, health check `/ping`, variables del `setup.sh` del back con `API_PROXY = https://${agent.attrServiceUrl}/invocations` y `DEMO_CUSTOMERS_JSON` de `back/app.yaml`, secrets `DATABRICKS_CLIENT_SECRET`, `SESSION_SECRET`, `DEMO_USERS_JSON`, `DEMO_LOGINS_JSON`, `AGENT_TOKEN`.
8. Front y CloudFront:
   - bucket privado (`BlockPublicAccess.BLOCK_ALL`, `enforceSSL`, `RemovalPolicy.DESTROY`, `autoDeleteObjects`);
   - `S3BucketOrigin.withOriginAccessControl`;
   - CloudFront Function desde `infra/lib/spa-rewrite.js` (viewer request: una URI sin extensión pasa a `/index.html`);
   - behavior por defecto: S3, `CACHING_OPTIMIZED`, `REDIRECT_TO_HTTPS`, la función;
   - behaviors `/api/*` y `/ping`: `HttpOrigin(back.attrServiceUrl)` con `HTTPS_ONLY` y `readTimeout` 60 s, `ALLOW_ALL`, `CACHING_DISABLED`, `ALL_VIEWER_EXCEPT_HOST_HEADER`, `compress: false`;
   - `BucketDeployment` desde `frontDist` con invalidación `/*`;
   - outputs: URL de CloudFront, URL del back y del agente.

---

## Group 4: Despliegue

9. Crear `infra/scripts/deploy.sh`: build del front (`npm --prefix front ci && npm --prefix front run build`), tags por defecto = imagen actual de cada servicio viejo o `BACK_TAG`/`AGENT_TAG`, y `npx cdk deploy ZenitStack -c backTag=… -c agentTag=… --require-approval never`. Las imágenes se construyen y suben con los `deploy.sh --push` existentes.
10. Crear `infra/README.md`: requisitos, `cdk bootstrap aws://335741630127/us-west-2` (una vez), deploy, qué revisar después, costo y cómo borrar el stack (`cdk destroy`).

---

## Group 5: Tests

11. Unit, `infra/tests/unit/`: `readAppYamlEnv` (lee y lanza si falta) y `spa-rewrite.js` (`/chat/1` → `/index.html`; `/assets/a.js` y `/index.html` sin cambio).
12. Integration, `infra/tests/integration/stack.test.ts` con `Template.fromStack` y un `frontDist` temporal: dos `AWS::AppRunner::Service` con CPU/memoria, puerto y health checks; `API_PROXY` hacia el agente nuevo; secrets solo como ARN (ningún valor plano); políticas de los roles con recursos exactos (sin `*`); behaviors de CloudFront (`/api/*`, `/ping`, por defecto con la función), política sin `Host`, caché desactivada, timeout 60 s, OAC en S3; tag `project=zenit`.
13. E2E, `infra/tests/e2e/synth.test.ts`: corre `npx cdk synth` (el entry point real) con contexto de prueba y comprueba que termina bien y deja la plantilla en `cdk.out`. La prueba contra AWS es manual (validation.md), porque esta fase no despliega.
