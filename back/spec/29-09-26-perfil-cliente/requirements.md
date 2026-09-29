# Requirements: Datos principales del cliente en el panel de contexto

El panel "Contexto del cliente" de la consola empieza con los datos
principales del cliente, tal como están en el banco. Esta fase suma un bloque
`profile` a `GET /api/advisor/conversations/:id/customer-context`, con los
datos esenciales para atender. El front lo muestra como primera sección
("Datos del cliente"). El resto de la respuesta, el control de acceso y el
esquema de la base no cambian.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. `customer-context` responde igual para `customer`, `interactions`,
   `transcripts` y `cases`: 204 sin cliente, 404 si no existe el chat, 502 si
   falla el warehouse.
2. Solo asesores y admins lo leen; un cliente recibe 403.

And it changes in these ways:

3. La respuesta suma `profile` con estos campos, tal como vienen del banco
   (cualquiera puede ser `null`):
   - `customerId`
   - `country` y `city` (`customer_360.country`, `.city`)
   - `segment` (`customer_360.segment`, por ejemplo "Plus")
   - `status` (`customer_360.customer_status`, por ejemplo "Active")
   - `customerSince` (`customer_360.registration_date`, ISO)
   - `products`: `[{ productType, last4 }]`, los productos activos que
     devuelve `bank_uc_consultas.get_products`
   - `contact`: `{ email, mobilePhone }` (`bank_silver.customers.email`,
     `.mobile_phone`)
   - `preferredChannel` (`customer_360.preferred_channel`, por ejemplo "Phone")
4. Los datos del perfil se leen en paralelo con las demás consultas del
   contexto, todas filtradas por el `customer_id` del chat.

## 2. Decisions

- Son 8 campos, todos columnas reales, sin inventar ninguno. El contacto sale
  de `bank_silver.customers`, porque `customer_360` no tiene email ni
  teléfono. Los productos salen de `get_products`, la misma función que usa
  el agente, porque trae tipo y últimos 4 dígitos de los productos activos.
- Quedan fuera documento, moneda, edad, score de crédito, ingresos y saldos,
  porque no hacen falta para atender o son sensibles. El nombre tampoco se
  repite en `profile`: ya va en `customer` y en el encabezado del chat.
- El contacto va completo, sin enmascarar, porque la ruta es solo de asesores
  y admins, y el asesor lo necesita para contactar al cliente. Los datos son
  del dataset del organizador.
- `customer_360` y `bank_silver.customers` se leen en una sola consulta con
  `LEFT JOIN`, y reemplazan a la consulta actual del nombre. `get_products`
  va en paralelo. Así el contexto no suma viajes al warehouse en serie.
- El SP de la App necesita `SELECT` sobre `workspace.bank_silver.customers`.
  El grant se aplica y se documenta en el README, como los anteriores.

## 3. Context

- `docs/flujo-atencion.md` §4: el contexto del cliente en la consola.
- Existing patterns:
  - `back/server/src/bank-data.ts`: `getCustomerProfile`, `getProducts` y
    `getCustomerContext` (consultas en paralelo con `runStatement`).
  - `back/tests/api-mocking/api-mock-handlers.ts`: mock del warehouse por
    tabla.
  - `back/README.md`: grants del SP.
