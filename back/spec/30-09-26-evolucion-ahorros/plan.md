# Plan: Evolución de los ahorros del cliente

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `back/server/src/savings-history.ts` | — | Nuevo: `buildSavingsHistory` (pura) |
| `back/server/src/bank-data.ts` | existente | Modificado: `getSavingsHistory` |
| `back/server/src/routes/products.ts` | existente | Modificado: `GET /savings-history` |
| `back/tests/fixtures/bank_ro.sql` | existente | Modificado: ahorros de Daniela (demo-ar-1) |
| `back/tests/ai-sdk-provider/savings-history.test.ts` | — | Nuevo |
| `back/tests/routes/products.test.ts` | existente | Modificado: casos de savings-history |

---

## Group 1: Endpoint

1. `savings-history.ts`: `buildSavingsHistory(accounts, movements, now)`.
   - `accounts` son `{ currency, balance }`. `movements` son
     `{ currency, date, type, amount }`, ya filtrados a `Approved` y a la
     ventana.
   - Por moneda, camina los movimientos del más nuevo al más viejo desde
     `current`. El saldo antes de cada movimiento es el de después, menos
     su efecto con signo.
   - Cada punto de un mes pasado es `current` menos el efecto de los
     movimientos posteriores a ese mes. Se redondea a 2 decimales.
   - Si algún saldo intermedio es menor que 0, la moneda queda fuera.
2. `bank-data.ts`: `getSavingsHistory(customerId, now = new Date())`, con dos
   consultas.
   - Saldos: las cuentas `Cuenta Ahorro` activas del cliente.
   - Movimientos: los `Approved` de esas cuentas desde el primer día del mes
     de hace 11 meses (UTC), con el join por `customer_id` y `product_id`.
3. `products.ts`: `GET /savings-history`, que reusa las validaciones de `/`
   (se extraen a un helper) y el 502.

## Group 2: Tests

4. Unit, `tests/ai-sdk-provider/savings-history.test.ts`:
   - reconstrucción mensual con los datos de Natalia;
   - suma de dos cuentas de la misma moneda;
   - una moneda que pasa por negativo queda fuera y las demás siguen;
   - sin movimientos, la serie es plana;
   - sin cuentas, `[]`;
   - un movimiento de este mes afecta los meses pasados, no el actual.
5. Integration: la fixture suma a Daniela (demo-ar-1), con fechas relativas
   a `now()`:
   - dos cuentas ARS activas;
   - una USD que da negativo;
   - una cerrada;
   - movimientos Declined y otros anteriores a la ventana.
6. End-to-end, en `products.test.ts`:
   - Daniela recibe solo ARS, con 12 meses y los saldos esperados;
   - Javier recibe una serie plana en COP;
   - Santiago (sin ahorro activo) recibe `[]`;
   - 400/401/403 como `/api/products`;
   - un token `sim-` resuelve a su cliente.
