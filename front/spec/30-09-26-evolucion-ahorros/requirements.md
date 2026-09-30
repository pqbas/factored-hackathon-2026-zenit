# Requirements: Evolución de tus ahorros

En Mis productos, el cliente ve cómo evolucionó su saldo ahorrado mes a mes durante los últimos 12 meses, con un gráfico de línea por moneda. Los datos vienen de `GET /api/products/savings-history`, que es de w1:p1. El back reconstruye el saldo hacia atrás desde el saldo actual con los movimientos aprobados, así que la curva es una estimación y solo el punto de hoy es real.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. El resumen, las tarjetas visuales, los movimientos y el detalle de cada producto.
2. Si el endpoint falla o no hay cuentas de ahorro, Mis productos se ve como hoy.

And it changes in these ways:

3. Si el cliente tiene cuentas de ahorro, el resumen muestra la sección "Evolución de tus ahorros" (PT: "Evolução das suas economias"), arriba de las tarjetas.
   - Hay un gráfico de línea por moneda, con 12 puntos (un mes cada uno).
   - Cada punto tiene un tooltip con el mes y el monto formateado en su moneda.
   - El saldo de hoy se destaca, con su monto grande y el punto final marcado.
4. El rótulo visible "Saldo estimado a partir de tus movimientos" (PT: "Saldo estimado a partir das suas movimentações") aclara que solo el punto de hoy es real.
5. Una moneda con ahorro pero sin serie (su reconstrucción dio negativa) muestra solo su saldo actual, sin línea, con la nota "Sin estimación del historial para esta moneda".

## 2. Decisions

- Un gráfico por moneda, no varias líneas en un mismo eje. COP, USD y ARS tienen escalas muy distintas: en un eje compartido, una línea en USD quedaría plana junto a una en COP.
- Un punto por mes, sin puntos por movimiento. Con pocos movimientos, la línea mensual se lee mejor, y así lo acordamos con w1:p1.
- El gráfico es SVG propio, con el estilo de Métricas (`rounded-2xl bg-secondary/50`, colores del tema, tooltips con `<title>`). Métricas ya no usa librería de gráficos.
- El saldo actual de las monedas sin serie sale de `/api/products` (la suma de las cuentas de ahorro de esa moneda), así el back no tiene que mandarlo.
- Contrato (w1:p1, 30/09): `{ estimated, series: [{ currency, current, points: [{ month: 'YYYY-MM', balance }] }] }`. Los errores son los mismos de `/api/products`.

## 3. Context

- Pedido del usuario vía w1:p4 (30/09). Muestra para las capturas: Natalia (demo-mx-5), cuyo ahorro baja de unos $16k en abril a $2.5k hoy.
- Código existente: `src/pages/ProductsPage.tsx`, `src/components/products/product-overview.tsx`, `src/lib/products.ts`, `src/components/metrics/daily-trend.tsx` (estilo).
