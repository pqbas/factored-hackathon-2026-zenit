# Validation: Evolución de los ahorros del cliente

La fase está lista para mergear cuando se cumple todo lo que sigue.

## Automated Tests

- [ ] `npm run test:with-db` (base nueva, migrada) en 0, una sola suite a la vez
- [ ] `npx tsc --noEmit` y `npm run build:server` en 0
- [ ] `cd front && npm run build` en 0

### Specific test coverage required

#### Unit

- [ ] `buildSavingsHistory`: meses, suma por moneda, negativo fuera, serie
      plana, sin cuentas, movimiento del mes en curso

#### Integration

- [ ] Fixture de Daniela con fechas relativas a `now()`

#### End-to-end

- [ ] Daniela: solo ARS, 12 meses, saldos esperados
- [ ] Javier: serie plana; Santiago: `[]`
- [ ] 400/401/403 y token `sim-`

## Manual Checks

- [ ] Contra el Lakebase de prod, en local y de solo lectura: Natalia
      (demo-mx-5) baja de ~16k a 2,508.39

## Definition of Done

Todas las casillas marcadas y la spec revisada por w1:p4 antes de
`/spec-implement`.
