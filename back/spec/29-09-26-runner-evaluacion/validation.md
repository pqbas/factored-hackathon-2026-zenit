# Validation: Runner de evaluación

La fase está lista para mergear cuando se cumple todo lo que sigue.

## Automated Tests

- [ ] `npm run test:with-db` (routes + unit, base nueva) en 0
- [ ] `npm run test:ephemeral` (routes + unit) en 0
- [ ] `npx tsc --noEmit`, `npm run build:server` y `npm run db:check` en 0
- [ ] `cd front && npm run build` contra la rama

### Specific test coverage required

#### Unit

- [ ] `observedOutcome` distingue `D`, `F` (es y pt) y respuesta normal
- [ ] Cada tipo de hallazgo inseguro se dispara con su caso y no con la frase
      de derivación
- [ ] `verdict` falla por motivo de derivación equivocado, por patrón
      faltante y por David hablando después de derivar
- [ ] `percentile` coincide con `percentile_cont` de Postgres
- [ ] `keywordIntent` clasifica mensajes en es y pt
- [ ] `buildReport` da los numeradores, denominadores y la variabilidad
      esperados sobre corridas fijas
- [ ] El runner rechaza una `--base` que no es local
- [ ] Un caso cambiado desde el commit fijado sin entrada en
      `case-changes.json` hace fallar el test de casos, y el `.md` lista cada
      cambio
- [ ] Un caso con `knownFailure` cuenta en las métricas y sale marcado en el
      `.md`
- [ ] `parseAgentOutputs` lee `usage`, `model`, `prompt_version` y
      `classifier`, y descarta un `usage` mal formado

#### Integration

- [ ] Los archivos de `scripts/eval/cases/` cumplen el esquema: 40 casos más
      L1 y L2, sin ids repetidos, con la mezcla del §7

#### End-to-end

- [ ] Un turno en vivo deja un `TurnMetric` `live` con duración, intención y
      tokens
- [ ] Un turno de la cola deja un `TurnMetric` `queue`
- [ ] Un turno descartado por pausa no deja `TurnMetric`
- [ ] Sin `usage` del agente, los tokens quedan `null` y el costo es `null`
- [ ] `/api/advisor/metrics` trae `latency` solo de turnos `live` y `cost`,
      sin cambiar los campos anteriores
- [ ] `/api/advisor/conversations/:id/turns` es 403 para asesor y 200 para
      admin

## Manual Checks

- [ ] Con el agente de w1:p3 en `:8001` y `scripts/eval/start-eval-back.sh
      --fresh`, `npm run eval -- --case 01,11,37 --runs 1` termina y escribe
      el `.json` y el `.md`
- [ ] `npm run eval` completo (40 casos × 3) termina y el reporte trae todas
      las métricas del punto 10 de requirements, con numerador y denominador
- [ ] El reporte declara `classifier: llm`, se llama `<fecha>-llm`, y sus
      supuestos de costo dicen que no incluye Jev
- [ ] En el reporte, #37 es `F` con "Tu sesión expiró…" y #40 no trae cifras
      ni derivación (con `fail_tools` del agente)
- [ ] `npm run eval -- --base https://dev-bank-assistant-ui-…` aborta sin
      mandar ningún request
- [ ] Consola → Métricas en `:3300` (o la API): `latency` y `cost` con valores
      de la corrida

## Definition of Done

Todas las casillas marcadas, el contrato del punto 15 confirmado con w1:p3, un
reporte real commiteado en `scripts/eval/results/` y el spec revisado por
w1:p4 antes de `/spec-implement`.

## Anexo: set held-out

- [ ] `eval-holdout.test.ts` pasa: 20 casos, mezcla, sin mensajes repetidos,
      registro de cambios, `--set`/`--label` y `compareToMarkdown`
- [ ] El commit que congela el holdout es anterior al ship de las
      correcciones de p3, y la rama no está en origin hasta ese ship
- [ ] `npm run eval -- --set holdout --label antes` contra `7115b17` escribe
      `<fecha>-holdout-llm-antes.json` y `.md`
- [ ] `npm run eval:compare` con los reportes disponibles escribe la tabla de
      dos columnas

## Anexo: guard de grounding

- [ ] `parseAgentOutputs` lee el guard disparado, `null`, ausente y mal
      formado
- [ ] `TurnMetric` guarda el guard disparado, no disparado (`false`) y no
      reportado (`null`)
- [ ] El reporte muestra disparos sobre turnos que lo reportan, reintentos
      respaldados, respuestas seguras y desglose por herramienta
