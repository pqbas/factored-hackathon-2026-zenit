# 17. AgentCore Runtime frente a App Runner para el agente

Análisis de factibilidad del 1 de octubre de 2026 para la etapa 2 de `spec/01-10-26-despliegue-aws/`: si el agente debía ir a Amazon Bedrock AgentCore Runtime en vez de un segundo servicio de App Runner. No se implementó nada ni se creó ningún recurso para AgentCore. Los datos salen de la documentación de AWS de esa fecha; lo que no se pudo confirmar está marcado.

## Decisión

El agente fue a App Runner (ver [16](16-agente-en-aws.md)), y AgentCore quedó documentado como siguiente paso.

- AgentCore es viable y casi gratis para este volumen, pero exige cambios en el agente y en el back que App Runner no pide.
- El ahorro frente a App Runner era de USD 0.34 a 1.87 por día, y en los 4 días que quedaban hasta la entrega no compensaba el riesgo.
- La versión que hace atractivo a AgentCore (Runtime V2, arranque en ~2 s) salió el 18 de septiembre de 2026. Tenía dos semanas y aún no se podía configurar con CloudFormation ni CDK.

## Comparación

| Tema | AgentCore Runtime | App Runner (1 vCPU / 2 GB) |
| --- | --- | --- |
| Contrato | `POST /invocations` y `GET /ping` en el puerto 8080, host 0.0.0.0 | Cualquier puerto, health check configurable |
| Imagen | ARM64 obligatorio, máximo 2 GB | x86, sin ese límite |
| Cómo llama el back | SigV4 con el rol de App Runner, o JWT; no ambos | URL HTTPS; solo cambia la URL |
| Cambio en el back | Firmar SigV4, URL con el ARN, header de sesión | Ninguno |
| Costo en reposo | USD 0 | USD 0.34/día |
| Costo del examen 20×3 | ~USD 0.03 a 0.10 (estimado) | USD 0.08 por hora de examen |
| Arranque en frío | ~2 s P75 en V2; 5.4 a 30 s en V1; por cada sesión nueva | No hay: la instancia queda encendida |
| Duración máxima | 15 min síncrono, 60 min en streaming | 120 s por request |
| Salida a internet (Jev) | Sí en modo PUBLIC | Sí |
| Secretos | Secrets Manager por código, o AgentCore Identity | Secreto inyectado como variable de entorno |
| Trazas | CloudWatch por defecto; Langfuse solo por OTLP | Langfuse con el callback de LangChain |
| us-west-2 | Sí, incluido V2 | Sí |
| Deploy sin corte | Sí (el endpoint DEFAULT pasa a la versión nueva) | Sí |
| Esfuerzo | 2 a 3 días (agente y back) | 0.5 a 1 día, sin tocar el back |
| Riesgo para la entrega | Alto | Bajo |

## Qué habría cambiado en el agente

- Puerto y rutas: host `0.0.0.0`, puerto `8080`, `POST /invocations` y `GET /ping`, que debe devolver `{"status": "Healthy"}`. El agente solo tenía `/health`.
- Cuerpo y streaming: la doc dice que el formato del payload depende del agente y que `/invocations` puede responder JSON o SSE. No confirma que el cuerpo actual (`input` + `custom_inputs`) y el SSE de un servidor propio pasen sin cambios.
- Arquitectura: ARM64 obligatorio. La máquina de build es x86_64, así que hacía falta `buildx` con emulación o CodeBuild ARM.
- Tamaño: el `.venv` pesaba 859 MB y entraba en el límite de 2 GB. El despliegue por zip no servía: máximo 250 MB comprimido y 750 MB descomprimido.
- Sesión: el header `X-Amzn-Bedrock-AgentCore-Runtime-Session-Id` pide entre 33 y 256 caracteres. Cada sesión corre en su propia microVM.
- Runtime V2 arranca desde una foto del proceso. Lo calculado al iniciar queda congelado (tokens, valores aleatorios, la hora) y los sockets no sobreviven; el token de Lakebase (1 hora) habría que pedirlo en cada request.
- Variables de entorno: V2 limita el total a 2.5 KB en contenedores, y `DEMO_SESSIONS_JSON` podía no caber.

## Cómo lo habría llamado el back

- SigV4: el rol de la instancia de App Runner con `bedrock-agentcore:InvokeAgentRuntime`, contra `https://bedrock-agentcore.us-west-2.amazonaws.com/runtimes/<ARN codificado>/invocations?qualifier=DEFAULT`.
- JWT: el runtime se configura con una URL de discovery OIDC, audiencias y clientes; el back manda `Authorization: Bearer`. Un runtime acepta SigV4 o JWT, no los dos.
- Los errores del contenedor llegan como 424, y hay un 409 reintentable mientras la sesión se crea.

## Costo

- Cobro por segundo sobre el consumo real de CPU y memoria, con mínimo de 1 s y de 128 MB. La CPU no se cobra durante la espera de I/O.
- V2: USD 0.1276 por vCPU-hora y USD 0.0169 por GB-hora; la memoria ociosa se libera a los 120 s.
- V1: USD 0.0895 por vCPU-hora y USD 0.00945 por GB-hora; la memoria se cobra hasta que la sesión termina (15 min de inactividad por defecto).
- Estimado, no medido, con 0.5 GB y 0.5 s de CPU por turno y una sesión por conversación: ~USD 0.0005 por conversación en V2. Eso da ~USD 0.03 el examen y ~USD 0.01 una demo de 20 conversaciones.
- App Runner: USD 0.007 por GB-hora provisionado y USD 0.064 por vCPU-hora activo en us-west-2.

## Red, secretos y trazas

- Modo PUBLIC: salida a internet según el blog de redes de AWS; la guía solo lo deja implícito. Las IP de salida no son fijas.
- Secretos: la doc recomienda AgentCore Identity o el rol de ejecución. No se encontró cómo inyectar un secreto como variable de entorno, así que el agente tendría que leerlos de Secrets Manager por código.
- Trazas: CloudWatch por defecto, con Transaction Search y `aws-opentelemetry-distro`. Para Langfuse, `DISABLE_ADOT_OBSERVABILITY=true` y exportar por OTLP; según la guía de Langfuse, el callback del SDK solo no funciona en AgentCore.

## Cuotas en us-west-2

- 5,000 sesiones activas por cuenta, 25 sesiones nuevas por segundo y 1,000 TPS de invocación.
- Máximo 2 vCPU y 8 GB por sesión.

## Lo que no se pudo confirmar en la doc

- Que el cuerpo actual del request y el SSE de un servidor propio pasen sin cambios.
- La salida TCP al puerto 5432 de Lakebase en modo PUBLIC.
- Que el token del service principal de Databricks sirva como JWT de entrada; si sirviera, el back solo cambiaría la URL.
- Si una sesión acepta invocaciones concurrentes. Con eso, el back podría usar una sola sesión fija y evitar los arranques en frío.
- La inyección de secretos como variables de entorno.

## Fuentes

- [Contrato del servicio](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-service-contract.html) y [contrato HTTP](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-http-protocol-contract.html)
- [Precios de AgentCore](https://aws.amazon.com/bedrock/agentcore/pricing/) y [precios de App Runner](https://aws.amazon.com/apprunner/pricing/)
- [Cuotas](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/bedrock-agentcore-limits.html) y [regiones](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agentcore-regions.html)
- [microVMs y V2](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-how-it-works.html), [optimizar para V2](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-v2-optimize.html) y [anuncio de V2](https://aws.amazon.com/about-aws/whats-new/2026/09/new-agentcore-runtime-generally-available/)
- [Sesiones](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-sessions.html), [auth de entrada y salida](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-oauth.html) e [InvokeAgentRuntime](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_InvokeAgentRuntime.html)
- [VPC](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agentcore-vpc.html), [patrones de red (blog)](https://aws.amazon.com/blogs/networking-and-content-delivery/network-connectivity-patterns-for-agents-deployed-on-amazon-bedrock-agentcore-runtime/) y [seguridad](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-security-best-practices.html)
- [Observabilidad](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-configure.html) y [Langfuse con AgentCore](https://langfuse.com/integrations/frameworks/amazon-agentcore)
