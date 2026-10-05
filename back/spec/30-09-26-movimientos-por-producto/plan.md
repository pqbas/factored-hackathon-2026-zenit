# Plan: Movimientos por producto en /api/products

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `back/server/src/bank-data.ts` | existente | Modificado: `getTransactions`, 10 por producto |
| `back/tests/fixtures/bank_ro.sql` | existente | Modificado: 24 movimientos de Javier (12 por producto) |
| `back/tests/routes/products.test.ts` | existente | Modificado: 10 por producto |

## Group 1: Consulta

1. `getTransactions`: un `row_number()` por `product_id`, que se queda con
   los 10 más nuevos de cada producto activo y los ordena por fecha
   descendente. Se conserva el join por `customer_id` y `product_id`.

## Group 2: Tests

2. Integration: la fixture pasa a 24 movimientos de Javier, 12 en la tarjeta
   y 12 en la cuenta de ahorro.
3. End-to-end: `products.test.ts` comprueba que vienen 20 (10 de cada
   producto), los más nuevos de cada uno, ordenados por fecha descendente.
   El otro cliente que comparte `product_id` sigue sin sumar filas.
