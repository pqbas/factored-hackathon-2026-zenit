# Validation: despliegue en AWS con CDK y CloudFront

La fase se puede mergear cuando pasa todo lo siguiente.

## Automated Tests

- `cd infra && npm run build` (`tsc --noEmit`) sin errores.
- `cd infra && npm test` pasa.
- `cd infra && npx cdk synth -c backTag=test -c agentTag=test` termina sin errores y sin llamar a AWS.

### Specific test coverage required

**Unit**
- `readAppYamlEnv` devuelve la variable de `app.yaml` y lanza si no existe.
- La CloudFront Function reescribe rutas sin extensión a `/index.html` y deja igual los archivos.

**Integration**
- Hay dos servicios App Runner con 1024 CPU, 2048 MB, puerto 8080 y health checks `/ping` y `/health`.
- `API_PROXY` del back apunta a la URL del agente nuevo.
- Los secrets van solo como ARN y las políticas de los roles no usan `*` como recurso.
- CloudFront tiene `/api/*` y `/ping` al back con caché desactivada, sin `Host`, `compress: false` y timeout 60 s; el behavior por defecto va a S3 con OAC y la función.

**End-to-end**
- `cdk synth` por la CLI genera `cdk.out/ZenitStack.template.json`.

## Manual Checks

Después de `infra/scripts/deploy.sh` (con OK del usuario):

- `zenit-back` y `zenit-agent` quedan `RUNNING`, y `bank-assistant-back` y `bank-assistant-agent` siguen igual (misma imagen y configuración).
- `https://<cloudfront>/ping` responde 200 y `https://<cloudfront>/api/demo-logins` lista los usuarios.
- Entrar por la URL de CloudFront como cliente, mandar un mensaje y ver la respuesta de David en streaming.
- Recargar `https://<cloudfront>/conversations` carga la app (no un 403 de S3).
- Entrar como asesor y como admin: la Bandeja y las métricas cargan.
- `https://<cloudfront>/api/history` sin sesión responde el 401 JSON del back, no `index.html`.

## Definition of Done

Los tests y `cdk synth` pasan, la rama está mergeada en `main`, y con el stack desplegado el chat, la consola y las métricas funcionan entrando por CloudFront sin cambios en los servicios actuales.
