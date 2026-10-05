# Validation: Datos demo para las métricas de resolución

La fase se puede mergear cuando pasa todo lo siguiente.

## Automated Tests

- `cd back && npx tsc --noEmit -p .` (o el chequeo de tipos de los scripts que use el repo) sin errores nuevos.
- `cd back && npx playwright test --config=playwright.unit.config.ts tests/ai-sdk-provider/simulate.test.ts` pasa.
- `cd back && SIM_PG_URL=postgres://…@127.0.0.1:55432/… npx playwright test --config=playwright.unit.config.ts tests/ai-sdk-provider/backfill-db.test.ts` pasa.

### Specific test coverage required

**Unit**
- El plan reparte 65/20/15 con suma exacta y es determinista con la misma seed.
- Los días de semana tienen 25–40 chats y el fin de semana 12–20.
- Todas las horas caen entre 08:00 y 19:59 de Lima.
- Los casos de uso son claves que el front etiqueta (o null).
- `assertLocalBase` acepta `*.awsapprunner.com` solo con `--allow-prod`.
- `--advisor-share` se valida entre 0 y 1.

**Integration**
- Tras el backfill local, las métricas por día cuentan IA, asistidas y asesor.
- `--cleanup --file` deja cero filas de esos chats.

## Manual Checks

- `npm run simulate:backfill -- --dry-run --allow-prod` imprime el plan por día y categoría y no escribe nada.
- Tras la corrida real (w1:pB, con OK del usuario): la pantalla de métricas, rango 7 días, muestra barras del 1 al 5 de octubre con las tres categorías.
- Los chats `[demo]` aparecen en la vista de cerradas, no en la Bandeja.
- `simulate:day` contra AWS con `SIM_ADMIN_USER`/`SIM_ADMIN_PASSWORD` crea conversaciones de hoy, y con `--advisor-share` aparecen resueltas por asesor y asistidas hoy.

## Definition of Done

Los tests pasan, la rama está subida y w1:pB tiene los comandos exactos para correr el backfill y el día real contra prod.
