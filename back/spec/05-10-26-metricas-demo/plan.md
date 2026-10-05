# Plan: Datos demo para las métricas de resolución

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `back/scripts/simulate/backfill-plan.ts` | — | New: plan puro (días, conteos, categoría, caso de uso, hora, mensajes) |
| `back/scripts/simulate/backfill.ts` | — | New: inserta/borra el plan en Lakebase |
| `back/scripts/simulate/common.ts` | existente | Modified: `identities()` con cookie de password mode |
| `back/scripts/simulate/day.ts` | existente | Modified: `--advisor-share` |
| `back/scripts/simulate/args.ts` | existente | Modified: flags de backfill y `--advisor-share` |
| `back/scripts/eval/guard.ts` | existente | Modified: `*.awsapprunner.com` con `--allow-prod` |
| `back/package.json` | existente | Modified: script `simulate:backfill` |
| `back/scripts/simulate/README.md` | existente | Modified: backfill y AWS |

---

## Group 1: Plan del backfill

1. Crear `back/scripts/simulate/backfill-plan.ts`:
   - `daysBetween(from, to)`.
   - `dailyCount(day, rand)`: 25–40 de lunes a viernes, 12–20 sábado y domingo.
   - `allocateCategories(n)`: ~65% `ai`, ~20% `assisted`, ~15% `human`
     (mayor resto, suma exacta).
   - `useCaseFor(category, rand)`: `ai` → GENERAL_INQUIRY / CASE_STATUS / sin
     caso; `assisted` → COMPLAINT / GENERAL_INQUIRY; `human` → COMPLAINT /
     CANCEL / COMMERCIAL / HUMAN_AGENT.
   - `businessTimeUtc(day, rand)`: 08:00–19:59 America/Lima (UTC−5) → Date.
   - `motiveFor`, `quotasFor`, `attachCustomers`: cada caso de uso pide un
     cliente del motivo que tiene lo que necesita (producto, cargo, caso).
   - `messagesFor(item, facts)`: intercambio corto con los datos reales del
     cliente (producto, cargo o caso), en es o pt según
     categoría (ai: pregunta, respuesta, gracias, despedida; assisted/human:
     pregunta, derivación, sistema "Te atiende un asesor.", respuesta del
     asesor, cierre), con minutos crecientes desde la hora de inicio.
   - `buildBackfillPlan({ from, to, seed })` determinista con `seededRandom`.

---

## Group 2: Script de backfill

2. Crear `back/scripts/simulate/backfill.ts` (`npm run simulate:backfill`):
   - Flags (`parseBackfillArgs` en `args.ts`): `--from`, `--to` (default
     2026-10-01..2026-10-04), `--seed`, `--dry-run`, `--allow-prod`,
     `--cleanup`, `--file`.
   - Sin `--allow-prod` exige `SIM_PG_URL` con host localhost/127.0.0.1.
   - Elige un cliente real por chat con `pickCustomers` (`pick.ts`), con
     cuotas por motivo según el caso de uso (`motiveFor`, `quotasFor`) y
     excluyendo los clientes que ya tienen un chat `demo-backfill`; lee
     apellido, producto (saldo, límite, moneda) para armar `CustomerFacts`.
   - Una transacción: inserta `Chat` (`userId = demo-backfill`, título
     `[demo] …`, `closedAt`, `handledBy = ai_agent`, `hadHuman`, `useCase`,
     `language`, `customerId`, `customerName`), sus `Message`, un `Handoff`
     cerrado si hubo humano, y un `ResolutionEvent`.
   - Escribe `runs/backfill-<from>_<to>.json` (chatIds) y no sobrescribe uno
     existente.
   - `--cleanup --file`: borra en orden `ResolutionEvent`, `Handoff`,
     `Message`, `Chat` de esos ids con `userId = demo-backfill`.
3. Agregar `"simulate:backfill": "tsx scripts/simulate/backfill.ts"` a
   `back/package.json`.

---

## Group 3: simulate:day en AWS

4. En `back/scripts/eval/guard.ts`, aceptar `https://*.awsapprunner.com` con
   `allowProd`.
5. En `back/scripts/simulate/common.ts`, `identities(base)`: si el host no es
   local ni `databricksapps.com`, `POST /api/login` con `SIM_ADMIN_USER` /
   `SIM_ADMIN_PASSWORD`, guardar la cookie y devolverla como `Cookie` para
   cliente y admin (`passwordIdentities`). `day.ts` y `cleanup.ts` lo
   esperan con `await`.
6. En `back/scripts/simulate/day.ts`, `--advisor-share` (default 0): tras
   leer el estado, toma `round(share × handoffs)` handoffs; la mitad
   `release resolved`, la otra mitad `release returned_to_agent` y un mensaje
   de despedida del cliente para que David cierre. Registra `advisor:
   'resolved' | 'returned'` en la corrida.
7. README de `scripts/simulate/`: backfill, AWS y `--advisor-share`.

---

## Group 4: Tests

8. Unit, `back/tests/ai-sdk-provider/simulate.test.ts`: plan del backfill
   (conteos por día, reparto 65/20/15 exacto, horas dentro del horario,
   determinismo por seed, claves de caso de uso válidas), `parseBackfillArgs`,
   `assertLocalBase` con awsapprunner, `--advisor-share` en `parseDayArgs`,
   reparto de handoffs del asesor.
9. Integration, `back/tests/ai-sdk-provider/backfill-db.test.ts`: contra el
   Postgres local (`SIM_PG_URL`, docker en :55432) con el esquema migrado:
   inserta un plan pequeño, verifica que `getResolutionMetrics` (o el mismo
   SQL) cuenta las tres categorías por día y que `--cleanup` deja cero filas.
   Se salta si no hay `SIM_PG_URL`.
10. E2E: no aplica en esta fase; el script no tiene entrada HTTP propia y el
    login de AWS ya está cubierto por `tests/ai-sdk-provider/login.test.ts`.
    La corrida real contra prod la hace w1:pB con OK del usuario.
