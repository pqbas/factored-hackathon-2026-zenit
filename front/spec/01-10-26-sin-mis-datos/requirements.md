# Requirements: Mis productos sin "Mis datos"

Se quita la sección "Mis datos" (Nombre y Cliente) del resumen de Mis productos. Repite el nombre del saludo y muestra el `customerId`, un código interno que no le sirve al cliente.

1. El resumen ya no muestra "Mis datos". "Movimientos de tus cuentas" ocupa todo el ancho.
2. Ninguna pantalla del cliente (chat, Mis productos) muestra el `customerId`. Se revisó: era el único lugar.

## Decisions

- El `customerId` sigue llegando en `/api/products`, pero no se pinta. En la consola del asesor no cambia nada.
