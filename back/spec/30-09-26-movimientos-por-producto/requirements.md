# Requirements: Movimientos por producto en /api/products

Bug que reportó w1:p4 (30-09-26) con una captura de Santiago (demo-mx-1): la
tarjeta 1070 dice "Todavía no hay movimientos", pero tiene. `/api/products`
devuelve los 10 últimos movimientos del cliente en total, y el front los
filtra por la tarjeta elegida. Desde #119, que sacó la lista general, las
tarjetas con movimientos más viejos quedan vacías.

## 1. Functional requirements

1. `transactions` de `GET /api/products` trae los últimos 10 movimientos de
   cada producto activo (`Tarjeta Crédito` y `Cuenta Ahorro`), no 10 en
   total.
2. La forma no cambia. Es una lista plana ordenada por fecha descendente, con
   los mismos campos: `{ date, productType, last4, type, merchant, amount,
   currency, status }`.
3. El resto de `/api/products` (cliente, productos, errores) no cambia.

## 2. Decisions

- Contrato acordado con w1:p6: sin `?last4=` ni endpoint nuevo, para que la
  pantalla no tenga que hacer un request por tarjeta. El front filtra por
  `productType` + `last4`, y corta "Movimientos de tus cuentas" a los 10 más
  recientes.
- SQL fijo sobre `bank_ro`: `row_number() over (partition by product_id
  order by transaction_date desc) <= 10`.
- Fuera de alcance: paginar o pedir más de 10 por producto.

## 3. Context

- `back/server/src/bank-data.ts`: `getTransactions`.
- `back/tests/routes/products.test.ts` y la fixture
  `back/tests/fixtures/bank_ro.sql` (los movimientos de Javier).
