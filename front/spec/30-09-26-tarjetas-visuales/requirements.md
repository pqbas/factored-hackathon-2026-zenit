# Requirements: Tarjetas visuales en Mis productos

En Mis productos, el cliente ve sus tarjetas de crédito como tarjetas visuales en un carrusel horizontal (referencia: Revolut Cards). Debajo va el detalle de la tarjeta seleccionada.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. El resumen (saludo, totales, últimos movimientos, mis datos), la lista lateral y el detalle de cada producto.

And it changes in these ways:

2. Si el cliente tiene tarjetas de crédito, el resumen muestra la sección "Mis tarjetas" (PT: "Meus cartões"), debajo de los totales.
   - Es un carrusel horizontal con una tarjeta visual por tarjeta de crédito.
   - Cada tarjeta lleva un degradado de color, el logo del banco, "Tarjeta de crédito", el número enmascarado "•••• •••• •••• 1070" y la moneda.
   - Se desliza con el dedo o el trackpad, con snap, y tiene puntos de paginación.
   - Tocar una tarjeta o un punto la selecciona.
3. Debajo del carrusel, el detalle de la tarjeta seleccionada:
   - saldo usado, límite y cupo disponible, con una barra de uso;
   - sus últimos movimientos;
   - dos acciones que abren el chat con David con el mensaje ya enviado: "Ver movimientos" y "Reclamar un cargo".
4. Cada tarjeta tiene su color, estable, con el mismo criterio que los avatares: un hash del id de la tarjeta sobre una paleta sin grises.
5. Responsive: en móvil, una tarjeta ocupa casi todo el ancho y se asoma la siguiente. Todo en ES y PT.

## 2. Decisions

- Solo se muestra lo que el banco devuelve: tipo, últimos 4 dígitos, moneda, saldo, límite y cupo. Nunca el número completo, el CVV, la fecha de vencimiento ni el titular grabado, porque no están en los datos y no se inventan. La marca (Visa, Mastercard) tampoco está, así que no se muestra.
- Las acciones solo abren el chat con David (`/?query=…`), que ya atiende movimientos y reclamos. No hay botones de congelar, ver PIN ni cambiar límites, porque el sistema no los hace.
- El carrusel es CSS (scroll-snap) más un índice calculado del scroll. Una librería de carrusel no hace falta para 1 a 3 tarjetas.
- Las cuentas de ahorro no cambian en esta fase. El gráfico de ahorros espera la decisión del usuario.

## 3. Context

- Pedido de w1:p4 (30/09), con referencia de Revolut Cards.
- Código existente:
  - `src/components/products/product-overview.tsx`, `product-detail.tsx` (barra de uso) y `transaction-list.tsx`;
  - `src/lib/products.ts`;
  - `src/lib/conversations.ts` (`avatarColor`, el hash FNV-1a);
  - `src/components/brand-mark.tsx`.
