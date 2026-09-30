# Requirements: Alineación en Mis productos

El resumen de Mis productos se alinea a una sola grilla (pedido del usuario, capturas de Santiago):

1. "¿Qué quieres hacer?": todas las tarjetas tienen la misma altura, el ícono va centrado en vertical, y el título y la descripción ocupan una línea con truncado. El texto completo queda en el tooltip.
2. Los totales usan la grilla de 3 columnas, igual que los bloques de arriba y de abajo.
3. "Mis tarjetas" queda dentro del ancho del contenido.
   - Sin márgenes negativos: no hay cortes a la izquierda ni a la derecha, ni una línea que sobresalga.
   - Cada tarjeta mide lo que una columna de la grilla (2 columnas en pantallas medianas y 85 % del ancho en móvil).
   - El snap alinea cada tarjeta al borde izquierdo.
   - El anillo de la tarjeta seleccionada va hacia adentro, para que el borde del carrusel no lo corte.
4. En la tarjeta, el número "•••• 1070" y "USD" comparten la línea base. En tarjetas angostas, el número baja de tamaño para no montarse sobre la moneda.
5. La barra de uso y su texto tienen el mismo margen izquierdo que las tarjetas.

## Decisions

- Con varias tarjetas a la vista, deslizar no cambia la selección si la tarjeta elegida sigue entera en pantalla. Un toque en un punto selecciona esa tarjeta, y el scroll suave no la pisa.
- El truncado también aplica a las tarjetas de la pantalla inicial del chat (el componente es compartido), para que ambas pantallas se vean igual.
