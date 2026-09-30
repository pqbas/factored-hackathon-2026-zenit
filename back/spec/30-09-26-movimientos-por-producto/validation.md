# Validation: Movimientos por producto en /api/products

## Automated Tests

- [ ] `npm run test:with-db` (base nueva, migrada) en 0, una sola suite a la vez
- [ ] `npx tsc --noEmit` y `npm run build:server` en 0

### Specific test coverage required

#### Unit

- [ ] Sin unit: es una consulta SQL, se cubre por la ruta

#### Integration

- [ ] Fixture de Javier con 12 movimientos por producto

#### End-to-end

- [ ] `/api/products` con Javier: 10 por producto, los más nuevos, en orden
      descendente, y sin filas del otro cliente

## Manual Checks

- [ ] Contra el Lakebase de prod, en local y de solo lectura: Santiago
      (demo-mx-1) trae movimientos de la 1070, la 6262 y la 4930

## Definition of Done

Todas las casillas marcadas y la spec revisada por w1:p4.
