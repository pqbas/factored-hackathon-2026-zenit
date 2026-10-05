# Requirements: Accesos rápidos en Mis productos

En Mis productos se quita la fila "Pídeselo a David" (Ver movimientos, Reclamar un cargo) que está debajo de la tarjeta seleccionada. Su lugar lo toma una sección "¿Qué quieres hacer?", debajo del saludo, con 5 accesos:

- las 4 opciones de la pantalla inicial del chat, con la misma tarjeta;
- "Ver movimientos" / "Ver movimentações" (ícono de lista).

Cada uno abre el chat con David con su mensaje ya enviado. Va en ES/PT y es responsive.

## Decisions

- "Reclamar un cargo" no se duplica: ya está como "Presentar un reclamo".
- Transferencias, y los avisos de inversión y ahorro, quedan solo en la maqueta (rama local), hasta que David los soporte (decisión de w1:p4, opción a).
- La tarjeta se extrae de `suggested-actions.tsx` a `action-card.tsx`, compartida por el chat y Mis productos.
