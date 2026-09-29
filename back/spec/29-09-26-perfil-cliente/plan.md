# Plan: Datos principales del cliente en el panel de contexto

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `back/server/src/bank-data.ts` | existente | Modificado: consulta de perfil (`customer_360` LEFT JOIN `bank_silver.customers`) y bloque `profile` |
| `back/tests/api-mocking/api-mock-handlers.ts` | existente | Modificado: el mock de `customer_360` devuelve las columnas del perfil |
| `back/tests/routes/customer-context.test.ts` | existente | Modificado: espera `profile` |
| `back/scripts/uc-grants.sh` | — | Nuevo: todos los grants del SP, incluido `bank_silver.customers` |
| `back/README.md` | existente | Modificado: apunta al script de grants |

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

3. Los campos vacíos (`''` o solo espacios) se devuelven como `null`, con un
   helper `blankToNull` en `bank-data.ts`.

4. Crear `back/scripts/uc-grants.sh <sp-application-id>`, que aplica con la
   Statement Execution API todos los grants del SP de la App: los del README
   más `SELECT` sobre `workspace.bank_silver.customers`. El README pasa a
   apuntar al script. No se corre ahora; se corre en el despliegue de
   back+front.

---

## Group 2: Tests

5. Unit: no hay lógica pura nueva. El mapeo se cubre de punta a punta
   (paso 7).

6. Integration: el proyecto no tiene una capa separada (ver paso 7).

7. End-to-end: en `back/tests/api-mocking/api-mock-handlers.ts`, el mock de
   `customer_360` devuelve también las columnas del perfil. En
   `back/tests/routes/customer-context.test.ts`, el caso de asesor y admin
   espera `profile` con los 8 campos mapeados, `products` desde el mock de
   `get_products`, `customer` sin cambios, y `mobilePhone: null` cuando el
   mock lo devuelve vacío. Otro caso: con un `customerId` cuyo perfil falla
   en el mock, la respuesta es 200 con `profile: null`. Un caso nuevo verifica que `/api/chat/:id`,
   `/api/history` y `/api/products` no traen `profile`.
