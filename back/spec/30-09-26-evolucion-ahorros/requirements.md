# Requirements: Evolución de los ahorros del cliente

Decisión del usuario vía w1:p4 (30-09-26): "Mis productos" muestra un gráfico
de línea "Evolución de tus ahorros" (lo hace w1:p6). El back da la serie.

El banco no guarda saldos históricos, solo el saldo actual y los movimientos.
La serie se reconstruye hacia atrás desde el saldo de hoy, y por eso es
estimada: solo el punto de hoy es real.

## 1. Functional requirements

1. `GET /api/products/savings-history?sessionToken=` devuelve
   `{ estimated: true, series: [{ currency, current, points: [{ month: 'YYYY-MM', balance }] }] }`.
2. Solo del cliente de la sesión, con los mismos permisos y errores que
   `/api/products`: 400 sin token, 401 con `reason` (`invalid` | `expired`),
   403 para el asesor y 502 si falla la lectura del banco. Acepta los tokens
   `sim-`.
3. Una serie por moneda, sobre las cuentas `Cuenta Ahorro` activas.
   - `current` es la suma de sus saldos actuales.
   - Hay 12 puntos, un mes cada uno, en orden ascendente. El último es el
     mes en curso, con el saldo de hoy. Los demás tienen el saldo a fin de
     ese mes, en UTC.
4. La reconstrucción usa solo los movimientos `Approved` de esas cuentas.
   Deposit suma. Withdrawal, Payment y Transfer restan.
5. Si el saldo reconstruido de una moneda es negativo en algún momento de la
   ventana (después de cualquier movimiento), esa moneda no viene en
   `series`. El front muestra solo su saldo actual, que saca de
   `/api/products`.
6. Un cliente sin cuentas de ahorro activas recibe `series: []`.

## 2. Decisions

- SQL fijo sobre `bank_ro` (`customer_products`, `customer_transactions`).
  No se usan la warehouse ni MCP.
- Un punto por mes, sin puntos por movimiento, a pedido de w1:p6: con pocos
  movimientos, la línea mensual se lee mejor.
- La consulta trae solo los movimientos de la ventana. La reconstrucción es
  una función pura, en TS.
- `sessionToken` va en la query, como en `/api/products`, por consistencia
  (revisión de w1:p4). Queda como deuda: en producción el token no debería
  ir en la URL, porque termina en los logs. Arreglarlo en todas las rutas
  del cliente a la vez.
- Fuera de alcance: saldos por cuenta (se suma por moneda) y otras zonas
  horarias.

## 3. Context

- Veredicto previo a w1:p4. Los montos no tienen signo y Transfer no tiene
  dirección. Si Transfer resta, un 5% de las cuentas da negativo; si suma,
  un 64%.
- Patrones: `back/server/src/routes/products.ts`,
  `back/server/src/bank-data.ts` y la fixture
  `back/tests/fixtures/bank_ro.sql`.
- Natalia (demo-mx-5, CLI-MA350GCK64W1) en prod da en USD unos 13.4k de oct a
  feb, 16.3k en mar, 11.8k en abr y 2,508.39 de may a sep.
