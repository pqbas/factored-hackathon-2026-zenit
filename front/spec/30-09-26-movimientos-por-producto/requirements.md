# Requirements: Movimientos por producto en Mis productos

Bug: una tarjeta dice "Todavía no hay movimientos", pero sí tiene. `/api/products` traía los 10 últimos movimientos del cliente en total, y si los 10 eran de otra tarjeta, las demás quedaban vacías. Esto se ve desde #119, que sacó la lista general.

1. El back (w1:p1) devuelve en `transactions` hasta 10 movimientos por producto activo, tarjetas y cuentas de ahorro. Es una lista plana, ordenada por fecha descendente, con los mismos campos que antes.
2. El front no cambia de contrato. La tarjeta seleccionada y el detalle de cada producto filtran por producto y muestran sus hasta 10.
3. "Movimientos de tus cuentas" junta los de todas las cuentas de ahorro y muestra los 10 más recientes.

## Decisions

- Una sola respuesta con todos los productos, sin `?last4=`: la pantalla no necesita un request por tarjeta (w1:p1).
- El corte a 10 del resumen de cuentas lo hace el front, para que la sección no crezca con varias cuentas.
