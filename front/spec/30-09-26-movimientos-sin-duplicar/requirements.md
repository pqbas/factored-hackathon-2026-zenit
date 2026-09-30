# Requirements: Movimientos sin duplicar en Mis productos

Hoy, en el resumen de Mis productos, los movimientos de una tarjeta aparecen dos veces: debajo de la tarjeta seleccionada en "Mis tarjetas", y otra vez en "Últimos movimientos". Esta fase deja cada movimiento en un solo lugar.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. "Mis tarjetas" con los movimientos de la tarjeta seleccionada.
2. "Mis datos".
3. El detalle de cada producto, desde la lista lateral, con sus movimientos.

And it changes in these ways:

4. "Últimos movimientos" pasa a llamarse "Movimientos de tus cuentas" (PT: "Movimentações das suas contas") y muestra solo los movimientos de las cuentas de ahorro.
5. Si el cliente no tiene cuentas de ahorro, esa sección no se muestra, y "Mis datos" ocupa su lugar solo.

## 2. Decisions

- Los movimientos de tarjeta quedan solo bajo la tarjeta seleccionada, porque ahí tienen el contexto de la tarjeta. Así lo propuso el usuario (vía w1:p4, con la captura de Eduardo).
- Una cuenta de ahorro sin movimientos en los 10 últimos muestra el estado vacío de siempre ("Todavía no hay movimientos."), porque la sección sí aplica al cliente.

## 3. Context

- `src/components/products/product-overview.tsx`, `src/lib/products.ts` (`transactionsFor`, `productKind`).
