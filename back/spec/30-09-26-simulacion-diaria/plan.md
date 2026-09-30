# Plan: Simulación diaria de tráfico en prod

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `back/scripts/simulate/sessions.sql` | — | Nuevo (aplicado) |
| `back/server/src/sim-sessions.ts` | — | Nuevo: `findSimCustomer(token)` |
| `back/server/src/demo-customers.ts` | existente | Modificado: `resolveSessionCustomer(token)` (demo o sim) |
| `back/server/src/routes/{chat,products,history}.ts` | existente | Modificado: usan `resolveSessionCustomer` |
| `back/scripts/simulate/{day,pick,conversations,cleanup}.ts` | — | Nuevos |
| `back/package.json` | existente | `simulate:day`, `simulate:cleanup` |
| `back/tests/fixtures/bank_ro.sql` | existente | `bank_sessions.sim_sessions` de fixture |

## Group 1: Sesiones sim en el back

1. `server/src/sim-sessions.ts`: `findSimCustomer(token)`.
   - Solo si el token empieza con `sim-`.
   - `bankQuery('SELECT customer_id, country, expires_at FROM bank_sessions.sim_sessions WHERE token = $1')`.
   - Vencida, sin fila o con error de base: `undefined` (falla cerrado, con
     `console.warn`).
2. `demo-customers.ts`: `resolveSessionCustomer(token)`, async. Primero
   `findDemoCustomer`, después `findSimCustomer`, y devuelve un
   `DemoCustomer`.
3. `routes/chat.ts`, `products.ts` y `history.ts`: cambian
   `findDemoCustomer` por `await resolveSessionCustomer`.

## Group 2: Simulación

4. `scripts/simulate/pick.ts`: consultas a `bank_ro` por motivo.
   - Excluye los clientes que ya están en `sim_sessions` y los 13 demo.
   - Productos activos, un cargo real con comercio (el más reciente),
     reclamos.
5. `scripts/simulate/conversations.ts`: plantillas es/pt por motivo, de 2 a
   4 mensajes, con variantes y los datos del cliente. Se elige con una
   semilla por día.
6. `scripts/simulate/day.ts` (`simulate:day`):
   - `--count`, `--base`, `--allow-prod` (mismo guard del eval), `--day`
     (hoy por defecto) y `--concurrency` (3);
   - inserta las sesiones, corre las conversaciones, aplica los pasos de
     asesor a las derivaciones (como admin), lee `/turns`;
   - escribe `runs/<fecha>.json` e imprime el resumen;
   - aborta si la estimación de costo pasa de USD 3.
7. `scripts/simulate/cleanup.ts` (`simulate:cleanup`): borra los chats del
   registro por la API y las filas `sim_sessions` del día.

## Group 3: Tests

8. Unit: `tests/ai-sdk-provider/simulate.test.ts`:
   - la mezcla de motivos suma el conteo y respeta los porcentajes;
   - cada plantilla genera de 2 a 4 mensajes con los datos del cliente;
   - ~20% en portugués.
9. Integration: la fixture `bank_ro.sql` suma `bank_sessions.sim_sessions`,
   con una fila vigente y una vencida.
10. End-to-end: en `tests/routes/products.test.ts`:
    - un token `sim-` vigente resuelve a su cliente;
    - uno vencido o desconocido da 404 o sin cliente;
    - el chat con un token `sim-` guarda el `customerId`.
