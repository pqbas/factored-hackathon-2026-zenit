# Plan: Datos principales del cliente en el panel de contexto

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `back/server/src/bank-data.ts` | existente | Modificado: consulta de perfil (`customer_360` LEFT JOIN `bank_silver.customers`) y bloque `profile` |
| `back/tests/api-mocking/api-mock-handlers.ts` | existente | Modificado: el mock de `customer_360` devuelve las columnas del perfil |
| `back/tests/routes/customer-context.test.ts` | existente | Modificado: espera `profile` |
| `back/README.md` | existente | Modificado: grant sobre `bank_silver.customers` |

---

## Group 1: Back

1. En `back/server/src/bank-data.ts`, cambiar `getCustomerProfile` por una
   consulta que traiga el nombre y los campos del perfil:
   `SELECT c.first_name, c.last_name, c.country, c.city, c.segment,
   c.customer_status, c.registration_date, c.preferred_channel, s.email,
   s.mobile_phone FROM ${catalog()}.bank_gold.customer_360 c LEFT JOIN
   ${catalog()}.bank_silver.customers s ON s.customer_id = c.customer_id WHERE
   c.customer_id = :customer_id`.
   - `/api/products` sigue recibiendo `{ firstName, lastName }` como hoy.

2. En `getCustomerContext`, sumar `getProducts(customerId)` al `Promise.all` y
   devolver `profile`: `{ customerId, country, city, segment, status,
   customerSince, products: [{ productType, last4 }], contact: { email,
   mobilePhone }, preferredChannel }`.

3. Aplicar el grant `SELECT` sobre `workspace.bank_silver.customers` al SP de
   la App (`046fa618-1a31-4129-b699-4c2bef67dbb7`) y sumarlo a la lista de
   grants de `back/README.md`.

---

## Group 2: Tests

4. Unit: no hay lógica pura nueva. El mapeo se cubre de punta a punta
   (paso 6).

5. Integration: el proyecto no tiene una capa separada (ver paso 6).

6. End-to-end: en `back/tests/api-mocking/api-mock-handlers.ts`, el mock de
   `customer_360` devuelve también las columnas del perfil. En
   `back/tests/routes/customer-context.test.ts`, el caso de asesor y admin
   espera `profile` con los 8 campos mapeados, `products` desde el mock de
   `get_products`, y `customer` sin cambios.
